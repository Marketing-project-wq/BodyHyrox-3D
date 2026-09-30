"use client";

import { VIEWER_SPIN } from "@/lib/config";

/**
 * Frames of the athlete turn for the canvas viewer.
 *
 * Every frame is downloaded once and kept COMPRESSED (a Blob, ~30–80 KB).
 * Only a few are decoded at a time: an ImageBitmap LRU capped per device
 * class (VIEWER_SPIN.cacheFrames), decoded at the size the canvas draws them
 * (never above the file's own size), and closed when evicted. So memory stays
 * bounded however many frames a set has (iOS Safari reloads tabs that decode
 * too many full-size images).
 *
 * Hosts without CORS fall back to <img> sources (bitmaps from them still draw
 * on a canvas; nothing ever reads their pixels).
 */

export type DeviceClass = "phone" | "tablet" | "desktop";

export function deviceClass(): DeviceClass {
  if (typeof window === "undefined") return "desktop";
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const short = Math.min(window.screen.width, window.screen.height);
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if ((mem != null && mem <= 2) || short < 600) return "phone";
  if (coarse) return "tablet";
  return "desktop";
}

type Source = Blob | HTMLImageElement;

export class FrameCache {
  private sources: (Source | null | undefined)[];
  private bitmaps = new Map<number, ImageBitmap>(); // insertion order = LRU order
  private decoding = new Map<number, Promise<ImageBitmap | null>>();
  private pinned = new Set<number>();
  private targetH = 0;
  private gen = 0;
  private disposed = false;
  readonly limit: number;
  /** Decode counters (?debug=perf). */
  readonly stats = { decodes: 0, decodeMsTotal: 0, decodeMsMax: 0 };

  constructor(private urls: string[], limit?: number) {
    this.sources = new Array(urls.length).fill(undefined);
    this.limit = limit ?? VIEWER_SPIN.cacheFrames[deviceClass()];
  }

  /** Download the frames in this order (a few at a time); onLoaded fires per frame. */
  async load(order: number[], onLoaded: (i: number, ok: boolean) => void): Promise<void> {
    const queue = order.filter((i) => this.sources[i] === undefined);
    const worker = async () => {
      for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
        if (this.disposed) return;
        const src = await this.fetchSource(this.urls[i]);
        if (this.disposed) return;
        this.sources[i] = src;
        onLoaded(i, !!src);
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, VIEWER_SPIN.loadConcurrency) }, worker));
  }

  private async fetchSource(url: string): Promise<Source | null> {
    try {
      const r = await fetch(url, { mode: "cors", cache: "force-cache" });
      if (r.ok) return await r.blob();
    } catch {
      /* no CORS on this host: load as an image below */
    }
    return await new Promise<HTMLImageElement | null>((res) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = url;
    });
  }

  loaded(i: number): boolean {
    return !!this.sources[i];
  }

  /** Is frame i decoded (without touching the LRU order)? */
  has(i: number): boolean {
    return this.bitmaps.has(i);
  }

  /** Decoded bitmap if ready (marks it recently used). */
  get(i: number): ImageBitmap | undefined {
    const b = this.bitmaps.get(i);
    if (b) {
      this.bitmaps.delete(i);
      this.bitmaps.set(i, b);
    }
    return b;
  }

  /** Frames being drawn right now are never evicted. */
  pin(indices: number[]) {
    this.pinned = new Set(indices);
  }

  /**
   * Decode height in device pixels (the canvas height). A clearly different
   * size (resize, rotation) drops the decoded frames; they re-decode lazily.
   */
  setTargetHeight(h: number) {
    const hh = Math.max(1, Math.round(h));
    if (this.targetH && Math.abs(hh - this.targetH) / this.targetH < 0.15) return;
    this.targetH = hh;
    this.gen++;
    this.bitmaps.forEach((b) => b.close());
    this.bitmaps.clear();
    this.decoding.clear();
  }

  /** Decode frame i (if its file is loaded); resolves null when it can't. */
  request(i: number): Promise<ImageBitmap | null> {
    const have = this.get(i);
    if (have) return Promise.resolve(have);
    const pending = this.decoding.get(i);
    if (pending) return pending;
    const src = this.sources[i];
    if (!src) return Promise.resolve(null);
    const gen = this.gen;
    const t0 = performance.now();
    const p = this.decode(src).then((bmp) => {
      const ms = performance.now() - t0;
      this.stats.decodes++;
      this.stats.decodeMsTotal += ms;
      this.stats.decodeMsMax = Math.max(this.stats.decodeMsMax, ms);
      if (this.decoding.get(i) === p) this.decoding.delete(i);
      if (!bmp) return null;
      if (this.disposed || gen !== this.gen) {
        bmp.close();
        return null;
      }
      this.bitmaps.set(i, bmp);
      this.evict();
      return bmp;
    });
    this.decoding.set(i, p);
    return p;
  }

  private natH = 0; // the set's file height, learned from the first decode

  private async decode(src: Source): Promise<ImageBitmap | null> {
    const known = src instanceof HTMLImageElement ? src.naturalHeight : this.natH;
    const h = this.targetH;
    if (known) {
      try {
        if (h && h < known) return await createImageBitmap(src, { resizeHeight: h, resizeQuality: "high" });
      } catch {
        /* resize options unsupported: decode at the file's size */
      }
      try {
        return await createImageBitmap(src);
      } catch {
        return null;
      }
    }
    // Size unknown yet: decode once at full size, then shrink if needed.
    try {
      const full = await createImageBitmap(src);
      this.natH = full.height;
      if (!h || h >= full.height) return full;
      try {
        const small = await createImageBitmap(full, { resizeHeight: h, resizeQuality: "high" });
        full.close();
        return small;
      } catch {
        return full;
      }
    } catch {
      return null;
    }
  }

  private evict() {
    for (const [i, b] of this.bitmaps) {
      if (this.bitmaps.size <= this.limit) break;
      if (this.pinned.has(i)) continue;
      b.close();
      this.bitmaps.delete(i);
    }
  }

  /** How many frames are decoded right now (tests / debug). */
  get decodedCount(): number {
    return this.bitmaps.size;
  }

  dispose() {
    this.disposed = true;
    this.bitmaps.forEach((b) => b.close());
    this.bitmaps.clear();
    this.decoding.clear();
    this.sources = [];
  }
}
