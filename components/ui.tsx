import type { BadgeTone } from "@/lib/config";
import { initials } from "@/lib/format";

/* ---------- Status badge (colored dot + tinted background) ---------- */
const TONES: Record<BadgeTone, { dot: string; text: string; bg: string }> = {
  green: { dot: "bg-green", text: "text-green", bg: "bg-[rgba(58,210,159,0.12)]" },
  amber: { dot: "bg-amber", text: "text-amber", bg: "bg-[rgba(246,180,70,0.12)]" },
  gray: { dot: "bg-gray", text: "text-gray", bg: "bg-[rgba(138,122,130,0.16)]" },
};

export function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  const t = TONES[tone];
  return (
    <span className={`badge ${t.bg} ${t.text}`}>
      <span className={`badge-dot ${t.dot}`} />
      {children}
    </span>
  );
}

/* ---------- Avatar initials chip ---------- */
export function Avatar({ name, className = "" }: { name: string; className?: string }) {
  return (
    <span
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-muted ${className}`}
    >
      {initials(name)}
    </span>
  );
}

/* ---------- KPI tile ---------- */
export function KpiCard({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: { text: string; tone: "up" | "down" | "neutral" };
}) {
  const deltaColor =
    delta?.tone === "up" ? "text-green" : delta?.tone === "down" ? "text-accent" : "text-muted";
  return (
    <div className="card p-4">
      <div className="eyebrow">{label}</div>
      <div className="mt-2 font-display text-[26px] font-bold leading-none tabnum text-text">
        {value}
      </div>
      {delta && <div className={`mt-2 text-xs tabnum ${deltaColor}`}>{delta.text}</div>}
    </div>
  );
}

/* ---------- Section card with red-accent title ---------- */
export function SectionCard({
  title,
  hint,
  action,
  children,
  className = "",
  bodyClassName = "p-4",
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`card ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <h3 className="section-title">{title}</h3>
        {hint ? <span className="text-xs text-faint">{hint}</span> : null}
        {action}
      </div>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/* ---------- Revenue area + line chart (pure SVG, theme-aware) ---------- */
export function RevenueChart({
  points,
}: {
  points: { label: string; value: number }[];
}) {
  const W = 640;
  const H = 190;
  const PADX = 6;
  const PADY = 14;
  const max = Math.max(...points.map((p) => p.value), 1);
  const n = points.length;
  const stepX = n > 1 ? (W - PADX * 2) / (n - 1) : 0;
  const xy = points.map((p, i) => ({
    x: PADX + i * stepX,
    y: H - PADY - (p.value / max) * (H - PADY * 2),
  }));
  const line = xy
    .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${xy[n - 1].x.toFixed(1)},${H} L${xy[0].x.toFixed(1)},${H} Z`;
  const grid = [0.25, 0.5, 0.75, 1].map((f) => H - PADY - f * (H - PADY * 2));
  const last = xy[n - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-44 w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="smb-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ff2d55" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#ff2d55" stopOpacity="0" />
          </linearGradient>
        </defs>
        {grid.map((gy, i) => (
          <line key={i} x1="0" y1={gy} x2={W} y2={gy} stroke="#2b2028" strokeWidth="1" />
        ))}
        <path d={area} fill="url(#smb-area)" />
        <path d={line} fill="none" stroke="#ff2d55" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={last.x} cy={last.y} r="5" fill="#ff2d55" stroke="#0d090b" strokeWidth="2.5" />
      </svg>
      <div className="mt-2 flex justify-between px-1">
        {points.map((p, i) => (
          <div key={i} className="text-center">
            <div className="text-[11px] uppercase tracking-wide text-faint">{p.label}</div>
            <div className="text-xs tabnum text-muted">
              {new Intl.NumberFormat("id-ID").format(Math.round(p.value / 1_000_000))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Simple proportional bar (top athletes) ---------- */
export function Bar({ ratio }: { ratio: number }) {
  return (
    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div
        className="h-full rounded-full bg-accent"
        style={{ width: `${Math.max(4, Math.min(100, ratio * 100))}%` }}
      />
    </div>
  );
}
