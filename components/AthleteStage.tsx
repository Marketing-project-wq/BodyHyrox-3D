import type { CSSProperties, ReactNode } from "react";
import { stageMotionVars } from "@/lib/config";

/**
 * Original 20FIT "neon stage": a dark room with a red-tinted perspective grid
 * floor, an ambient glow that slowly breathes, a few thin neon beams, faint
 * drifting dust, and a glowing platform the athlete figure (its children)
 * stands on. Fills its (full-screen) parent edge-to-edge and centers the
 * figure. Purely presentational — no data, no client JS. All motion is CSS
 * (see `.stage-*` in globals.css); durations/intensity come from config, and
 * everything is reduced on phones / disabled for prefers-reduced-motion.
 *
 * Only used by the public athlete page (`/atlet/[id]`); the `.stage-*` classes
 * are namespaced, so nothing else is affected.
 */
export function AthleteStage({ children }: { children: ReactNode }) {
  return (
    <div
      className="stage absolute inset-0 overflow-hidden bg-[#08080a]"
      style={stageMotionVars() as CSSProperties}
    >
      <div className="stage-glow stage-breathe" aria-hidden />

      <svg
        className="stage-beams stage-beam-pulse"
        viewBox="0 0 1000 620"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <g fill="none" stroke="#ff2d55" strokeWidth="1.4" strokeLinecap="round">
          <line x1="150" y1="-20" x2="332" y2="640" />
          <line x1="850" y1="-20" x2="668" y2="640" />
          <line x1="44" y1="130" x2="-26" y2="640" strokeOpacity="0.55" />
          <line x1="956" y1="130" x2="1026" y2="640" strokeOpacity="0.55" />
        </g>
      </svg>

      <div className="stage-floor stage-floor-drift" aria-hidden />

      {/* Faint floating dust — a few slow motes; disabled for reduced-motion. */}
      <div className="stage-dust" aria-hidden>
        {Array.from({ length: 7 }).map((_, i) => (
          <span key={i} className={`stage-mote stage-mote-${i + 1}`} />
        ))}
      </div>

      <div className="stage-platform" aria-hidden />

      {/* Figure stands centered on the platform, filling the stage height */}
      <div className="relative z-10 flex h-full items-center justify-center px-6">
        {children}
      </div>

      <div className="stage-vignette" aria-hidden />
    </div>
  );
}
