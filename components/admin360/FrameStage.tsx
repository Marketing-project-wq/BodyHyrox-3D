"use client";

import type { CSSProperties, ReactNode } from "react";
import { VIEWER_360 } from "@/lib/config";
import { frameCss, transformFoot, type Foot, type FrameTransform } from "@/lib/media360";

/** Ground line of the stage, as a fraction of the frame height (same as the public viewer). */
export const GROUND = 1 - VIEWER_360.feetLinePct / 100;

export type StageLayer = {
  key: string;
  src: string | undefined;
  t?: FrameTransform;
  /** Raw (untransformed) feet: transform pivot + ground anchoring. */
  foot?: Foot | null;
  opacity?: number;
  /** CSS filter for onion-skin tinting. */
  filter?: string;
  hidden?: boolean;
};

/**
 * How the public viewer places a frame: its transform around the feet, then
 * shifted so the (transformed) feet land on the ground line. Returns the
 * vertical shift (fraction of height) and the effective feet.
 */
export function placeFrame(foot: Foot | null | undefined, t: FrameTransform | undefined) {
  if (!foot) return { shift: 0, eff: null as Foot | null };
  const eff = transformFoot(foot, t);
  return { shift: GROUND - eff.toe, eff };
}

/**
 * A frame box with the athlete painted like the public stage (dark backdrop,
 * ground line). Layers stack in order (last on top). `guides` draws the
 * vertical centre, head line and ground line.
 */
export function FrameStage({
  layers,
  aspect,
  guides,
  headY,
  targetX,
  className = "",
  style,
  children,
  noTransform,
}: {
  layers: StageLayer[];
  /** width / height of the frames */
  aspect: number;
  guides?: boolean;
  /** Head line (fraction of height, stage coordinates). */
  headY?: number | null;
  /** Neighbours' body centre (fraction of width). */
  targetX?: number | null;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  /** Show the raw photos (before/after comparison). */
  noTransform?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-lg ${className}`}
      style={{
        aspectRatio: String(aspect),
        background: "radial-gradient(120% 70% at 50% 35%, #3a1119 0%, #14080b 60%, #0b0708 100%)",
        ...style,
      }}
    >
      {/* platform glow at the ground line */}
      <div
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[50%]"
        style={{
          top: `${GROUND * 100}%`,
          width: "80%",
          height: "5%",
          background: "radial-gradient(50% 50% at 50% 50%, rgba(255,45,85,0.45), rgba(255,45,85,0.12) 60%, transparent 100%)",
        }}
      />
      {layers.map((l) => {
        if (l.hidden || !l.src) return null;
        const t = noTransform ? undefined : l.t;
        const { shift } = placeFrame(l.foot, t);
        const fc = frameCss(t, l.foot);
        return (
          <div
            key={l.key}
            className="pointer-events-none absolute inset-0"
            style={{ transform: `translateY(${(shift * 100).toFixed(3)}%)`, opacity: l.opacity ?? 1, filter: l.filter }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={l.src}
              alt=""
              draggable={false}
              className="absolute inset-0 h-full w-full object-contain"
              style={{ transform: fc.transform, transformOrigin: fc.transformOrigin }}
            />
          </div>
        );
      })}
      {guides && (
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute inset-y-0 left-1/2 w-px bg-cyan-300/70" />
          {targetX != null && (
            <div className="absolute inset-y-0 w-px border-l border-dashed border-amber-300/80" style={{ left: `${targetX * 100}%` }} />
          )}
          {headY != null && (
            <div className="absolute inset-x-0 h-px border-t border-dashed border-amber-300/80" style={{ top: `${headY * 100}%` }} />
          )}
          <div className="absolute inset-x-0 h-px bg-[#ff2d55]" style={{ top: `${GROUND * 100}%` }} />
        </div>
      )}
      {children}
    </div>
  );
}
