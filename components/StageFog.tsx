"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { STAGE_FOG, VIEWER_360 } from "@/lib/config";
import { deviceClass } from "@/lib/frame-cache";

type Rgb = [number, number, number];

/** "#00b4ff" / "rgb(0, 180, 255)" → [r, g, b] (cyan if unreadable). */
function parseColor(c: string): Rgb {
  const s = c.trim();
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (x) => x + x) : hex[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
  }
  const rgb = s.match(/rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return [0, 180, 255];
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const step = (a: number, b: number, t: number) => smooth(clamp01((t - a) / (b - a)));

/**
 * Value noise on a cx × cy lattice that wraps left-right (so a texture made
 * from it tiles without a seam): n(u, v), u in tiles (any real), v in 0..1.
 */
function lattice(rand: () => number, cx: number, cy: number) {
  const g = Array.from({ length: (cy + 1) * cx }, rand);
  const at = (gx: number, gy: number) => g[gy * cx + (((gx % cx) + cx) % cx)];
  return (u: number, v: number) => {
    const fx = u * cx;
    const fy = clamp01(v) * cy;
    const x0 = Math.floor(fx);
    const y0 = Math.min(cy - 1, Math.floor(fy));
    const tx = smooth(fx - x0);
    const ty = smooth(fy - y0);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
    return a + (b - a) * ty;
  };
}

/**
 * One fog sheet texture (seamless left-right): a rolling top edge, billows
 * inside (domain-warped noise), white at the top turning to the theme colour
 * toward the floor, fading out below the platform's front edge. `feet` and
 * `front`: where the feet line and the platform's front edge fall (0 top ..
 * 1 bottom of the sheet).
 */
function fogTexture(rgb: Rgb, w: number, h: number, seed: number, feet: number, front: number): HTMLCanvasElement | null {
  const T = STAGE_FOG.texture;
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const ridge = [lattice(rand, 5, 1), lattice(rand, 11, 1), lattice(rand, 23, 1)];
  const warp = lattice(rand, 4, 2);
  const body = [
    { n: lattice(rand, 4, 2), a: 0.5 },
    { n: lattice(rand, 8, 3), a: 0.28 },
    { n: lattice(rand, 16, 5), a: 0.14 },
    { n: lattice(rand, 32, 8), a: 0.08 },
  ];
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (!g) return null;
  const img = g.createImageData(w, h);
  const d = img.data;
  // The rolling top edge per column, and how far down it takes to get dense.
  const top = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    const u = x / w;
    const r = 0.55 * ridge[0](u, 0) + 0.3 * ridge[1](u, 0) + 0.15 * ridge[2](u, 0);
    top[x] = feet * (T.topMin + T.topRange * r);
  }
  const ramp = T.ramp * feet;
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    const fade = 1 - step(front - 0.05, 1, v);
    const tint = STAGE_FOG.tintTop + (STAGE_FOG.tintBottom - STAGE_FOG.tintTop) * clamp01(v / front);
    const cr = 255 + (rgb[0] - 255) * tint;
    const cg = 255 + (rgb[1] - 255) * tint;
    const cb = 255 + (rgb[2] - 255) * tint;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inside = step(top[x], top[x] + ramp, v) * fade;
      if (inside <= 0) {
        d[i + 3] = 0;
        continue;
      }
      const u = x / w + 0.12 * (warp(x / w, v) - 0.5);
      let n = 0;
      for (const o of body) n += o.a * o.n(u, v);
      const puff = clamp01((n - 0.25) / 0.5);
      // brighter billows, so the fog has depth instead of a flat veil
      const lift = T.highlight * puff;
      d[i] = cr + (255 - cr) * lift;
      d[i + 1] = cg + (255 - cg) * lift;
      d[i + 2] = cb + (255 - cb) * lift;
      d[i + 3] = Math.round(255 * inside * (1 - T.billow + T.billow * puff));
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Textures already made (per colour, size and geometry): reused across athletes. */
const textureCache = new Map<string, Promise<string>>();

function textureUrl(rgb: Rgb, w: number, h: number, seed: number, feet: number, front: number): Promise<string> {
  const key = [rgb.join(","), w, h, seed, feet.toFixed(3), front.toFixed(3)].join("|");
  let p = textureCache.get(key);
  if (!p) {
    p = new Promise<string>((res) => {
      const c = fogTexture(rgb, w, h, seed, feet, front);
      if (!c) return res("");
      if (c.toBlob) c.toBlob((b) => res(b ? URL.createObjectURL(b) : c.toDataURL("image/png")), "image/png");
      else res(c.toDataURL("image/png"));
    });
    textureCache.set(key, p);
  }
  return p;
}

/**
 * Low "dry ice" fog over the platform, in front of the athlete's feet
 * (STAGE_FOG, docs/STAGE_SPEC.md). Placed in the athlete frame's own
 * coordinates (it zooms with the athlete); under the zone rings. Sheets of two
 * seamless textures drift sideways at unrelated speeds, roll slowly up and
 * down and thin in and out (transform / opacity animations only, run by the
 * compositor). `still`: no motion (CSS platform without WebGL; also always
 * under prefers-reduced-motion). `simple`: a weak device, one sheet that only
 * drifts. `thin`: zoomed onto a zone low on the legs.
 */
export function StageFog({ thin = false, still = false, simple = false }: { thin?: boolean; still?: boolean; simple?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [tex, setTex] = useState<{ urls: string[]; glow: string } | null>(null);
  const [lite, setLite] = useState(false);
  const preset = STAGE_FOG.presets[STAGE_FOG.density] ?? STAGE_FOG.presets.medium;
  const layers = useMemo(
    () => STAGE_FOG.layers.slice(0, simple ? STAGE_FOG.weak.layers : lite ? STAGE_FOG.lite.layers : STAGE_FOG.layers.length),
    [lite, simple],
  );
  const height = preset.aboveFrac + STAGE_FOG.belowFrac;
  // feet line / platform front edge inside the fog layer (0 top .. 1 bottom)
  const feet = preset.aboveFrac / height;
  const front = (preset.aboveFrac + STAGE_FOG.frontFrac) / height;

  useEffect(() => {
    const el = rootRef.current;
    if (!el || !STAGE_FOG.enabled) return;
    let alive = true;
    const rgb = parseColor(getComputedStyle(el).getPropertyValue("--accent") || "#00b4ff");
    const isLite = deviceClass() === "phone";
    setLite(isLite);
    const w = isLite ? STAGE_FOG.lite.textureW : STAGE_FOG.texture.w;
    const h = isLite ? STAGE_FOG.lite.textureH : STAGE_FOG.texture.h;
    // after the first paint of the athlete: the textures take a few ms of script
    const t = window.setTimeout(() => {
      Promise.all([0, 1].map((k) => textureUrl(rgb, w, h, STAGE_FOG.texture.seed + 7919 * k, feet, front))).then((urls) => {
        if (alive && urls.every(Boolean)) setTex({ urls, glow: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${STAGE_FOG.glow.opacity})` });
      });
    }, 0);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [feet, front]);

  // Drift, roll and thin in / out. Stopped while the tab is hidden or the
  // stage is off screen.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.dataset.fogMode = !tex ? "loading" : still || reduce ? "still" : simple ? "simple" : lite ? "lite" : "full"; // ?debug=perf
    if (!tex || still || reduce) return;
    const anims: Animation[] = [];
    el.querySelectorAll<HTMLElement>("[data-fog-sheet]").forEach((sheet, k) => {
      const L = layers[k];
      if (!L) return;
      const [from, to] = drift(L);
      anims.push(
        sheet.animate([{ transform: `translate3d(${from}%,0,0)` }, { transform: `translate3d(${to}%,0,0)` }], {
          duration: L.sec * 1000,
          iterations: Infinity,
          easing: "linear",
          delay: -phase(k) * L.sec * 1000, // the same place the still sheet shows
        }),
      );
      const roll = sheet.parentElement;
      if (roll && !simple) {
        anims.push(
          roll.animate([{ transform: "translate3d(0,0,0)" }, { transform: `translate3d(0,${-100 * L.bobFrac}%,0)` }], {
            duration: L.bobSec * 1000,
            iterations: Infinity,
            direction: "alternate",
            easing: "ease-in-out",
            delay: -k * 1300,
          }),
        );
        if (L.pulse > 0)
          anims.push(
            roll.animate([{ opacity: L.opacity }, { opacity: L.opacity * (1 - L.pulse) }], {
              duration: L.pulseSec * 1000,
              iterations: Infinity,
              direction: "alternate",
              easing: "ease-in-out",
              delay: -k * 2100,
            }),
          );
      }
    });
    let onScreen = true;
    const sync = () => {
      const run = onScreen && document.visibilityState !== "hidden";
      anims.forEach((a) => (run ? a.play() : a.pause()));
    };
    const io =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(([e]) => {
            onScreen = e.isIntersecting;
            sync();
          })
        : null;
    io?.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => {
      io?.disconnect();
      document.removeEventListener("visibilitychange", sync);
      anims.forEach((a) => a.cancel());
    };
  }, [tex, layers, still, simple, lite]);

  if (!STAGE_FOG.enabled) return null;
  const line = 1 - VIEWER_360.feetLinePct / 100; // feet line, share of the frame height from the top
  const width = STAGE_FOG.widthFrac;
  const solid = `${(100 * STAGE_FOG.solidWidth).toFixed(0)}%`;
  return (
    <div
      ref={rootRef}
      data-stage-fog
      aria-hidden
      className="stage-fog pointer-events-none absolute z-[5]"
      style={
        {
          left: `${(50 - (100 * width) / 2).toFixed(2)}%`,
          width: `${(100 * width).toFixed(2)}%`,
          top: `${(100 * (line - preset.aboveFrac)).toFixed(2)}%`,
          height: `${(100 * height).toFixed(2)}%`,
          opacity: tex ? preset.opacity * (thin ? STAGE_FOG.zoomThinOpacity : 1) : 0,
          "--fog-solid": solid,
          "--fog-fade": `${STAGE_FOG.fadeMs}ms`,
        } as React.CSSProperties
      }
    >
      {tex && (
        <>
          {/* the platform's light on the fog from below */}
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(ellipse ${STAGE_FOG.glow.widthPct}% ${STAGE_FOG.glow.heightPct}% at 50% ${(100 * front).toFixed(0)}%, ${tex.glow}, transparent 100%)`,
            }}
          />
          {layers.map((L, k) => (
            <div key={k} className="absolute inset-0" style={{ opacity: L.opacity }}>
              <div
                data-fog-sheet
                className="absolute inset-y-0 left-0 will-change-transform"
                style={{
                  width: `${(100 * (1 + L.size)).toFixed(2)}%`,
                  backgroundImage: `url(${tex.urls[L.tex] ?? tex.urls[0]})`,
                  backgroundRepeat: "repeat-x",
                  backgroundSize: `${((100 * L.size) / (1 + L.size)).toFixed(3)}% 100%`,
                  transform: `translate3d(${stillAt(L, k).toFixed(3)}%,0,0)`,
                }}
              />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

type Layer = (typeof STAGE_FOG.layers)[number];

/** A sheet drifts one tile (in % of the sheet's own width), left or right. */
function drift(L: Layer): [number, number] {
  const shift = (100 * L.size) / (1 + L.size);
  return L.dir < 0 ? [0, -shift] : [-shift, 0];
}

/** Where along its drift sheet k starts, so the sheets never line up the same way. */
const phase = (k: number) => (k * 0.37 + 0.11) % 1;

function stillAt(L: Layer, k: number): number {
  const [from, to] = drift(L);
  return from + (to - from) * phase(k);
}
