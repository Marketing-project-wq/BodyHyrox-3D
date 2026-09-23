import type { ReactNode } from "react";

/**
 * Original 20FIT "neon stage": a dark room with a red-tinted perspective grid
 * floor, soft ambient glow, a few thin neon beams, and a glowing platform the
 * athlete figure (its children) stands on. Purely presentational — no data,
 * no client JS. All effects are CSS/SVG (see `.stage-*` in globals.css), kept
 * light and reduced on phones / prefers-reduced-motion.
 */
export function AthleteStage({ children }: { children: ReactNode }) {
  return (
    <div className="stage relative overflow-hidden rounded-3xl border border-white/10 bg-[#08080a]">
      <div className="stage-glow stage-pulse" aria-hidden />

      <svg
        className="stage-beams"
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

      <div className="stage-floor" aria-hidden />
      <div className="stage-platform" aria-hidden />

      {/* Figure stands centered on the platform */}
      <div className="relative z-10 flex min-h-[420px] items-end justify-center px-6 pb-10 pt-8 sm:min-h-[500px] sm:pb-14 sm:pt-10">
        {children}
      </div>

      <div className="stage-vignette" aria-hidden />
    </div>
  );
}
