import type { BadgeTone } from "@/lib/config";
import { initials } from "@/lib/format";

/* ---------- Brand logo ----------
 * The 20FIT logo is a light/white wordmark with a red accent, made for dark
 * backgrounds. So on dark surfaces (sidebar, landing) it's shown as-is; on
 * light surfaces (login, setup notice) it sits on a dark backing so the white
 * parts stay visible. */
const LOGO_SRC = "https://media.20fit.id/wp-content/uploads/2026/09/new-logo-20fit.png";

export function Logo({
  imgClassName = "h-6",
  onLight = false,
  className = "",
}: {
  imgClassName?: string;
  onLight?: boolean;
  className?: string;
}) {
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO_SRC}
      alt="20FIT"
      className={`${imgClassName} w-auto select-none`}
      draggable={false}
    />
  );
  return (
    <span
      className={`inline-flex items-center ${
        onLight ? "rounded-lg bg-sidebar px-3 py-2" : ""
      } ${className}`}
    >
      {img}
    </span>
  );
}

/* ---------- Empty state (no data yet) ---------- */
export function EmptyState({
  title,
  hint,
  action,
  className = "",
  compact = false,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 text-center ${
        compact ? "px-4 py-6" : "px-6 py-12"
      } ${className}`}
    >
      <p className={`font-medium text-text ${compact ? "text-sm" : "text-base"}`}>{title}</p>
      {hint && <p className="max-w-xs text-xs text-muted">{hint}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/* ---------- Status badge (colored dot + tinted background) ---------- */
const TONES: Record<BadgeTone, { dot: string; text: string; bg: string }> = {
  green: { dot: "bg-green", text: "text-green", bg: "bg-[rgba(18,150,90,0.12)]" },
  amber: { dot: "bg-amber", text: "text-amber", bg: "bg-[rgba(183,121,31,0.14)]" },
  gray: { dot: "bg-gray", text: "text-muted", bg: "bg-[rgba(20,20,20,0.06)]" },
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
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[10px] font-semibold text-muted ${className}`}
    >
      {initials(name)}
    </span>
  );
}

/* ---------- Compact KPI tile ---------- */
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
    <div className="card px-3.5 py-3">
      <div className="eyebrow">{label}</div>
      <div className="mt-1.5 font-mono text-[22px] font-semibold leading-none text-text">
        {value}
      </div>
      {delta && <div className={`mt-1.5 text-[11px] tabnum ${deltaColor}`}>{delta.text}</div>}
    </div>
  );
}

/* ---------- Section card (flex column; optional scrollable body) ---------- */
export function SectionCard({
  title,
  hint,
  action,
  children,
  className = "",
  bodyClassName = "p-3",
  scrollBody = false,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  scrollBody?: boolean;
}) {
  return (
    <section className={`card flex flex-col ${className}`}>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2.5">
        <h3 className="section-title">{title}</h3>
        {hint ? <span className="text-[11px] text-faint">{hint}</span> : null}
        {action}
      </div>
      <div className={`min-h-0 flex-1 ${scrollBody ? "overflow-y-auto" : ""} ${bodyClassName}`}>
        {children}
      </div>
    </section>
  );
}

/* ---------- Revenue area + line chart (fills its container height) ---------- */
export function RevenueChart({
  points,
  emptyLabel,
}: {
  points: { label: string; value: number }[];
  emptyLabel?: string;
}) {
  const hasData = points.length > 0 && points.some((p) => p.value > 0);
  if (!hasData) {
    return (
      <div className="flex h-full min-h-[150px] items-center justify-center lg:min-h-0">
        <p className="text-sm text-muted">{emptyLabel ?? "No data yet."}</p>
      </div>
    );
  }

  const W = 640;
  const H = 180;
  const PADX = 6;
  const PADY = 12;
  const max = Math.max(...points.map((p) => p.value), 1);
  const nn = points.length;
  const stepX = nn > 1 ? (W - PADX * 2) / (nn - 1) : 0;
  const xy = points.map((p, i) => ({
    x: PADX + i * stepX,
    y: H - PADY - (p.value / max) * (H - PADY * 2),
  }));
  const line = xy.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${line} L${xy[nn - 1].x.toFixed(1)},${H} L${xy[0].x.toFixed(1)},${H} Z`;
  const grid = [0.25, 0.5, 0.75, 1].map((f) => H - PADY - f * (H - PADY * 2));
  const last = xy[nn - 1];

  return (
    <div className="flex h-full min-h-[150px] flex-col lg:min-h-0">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full flex-1 min-h-0" preserveAspectRatio="none">
        <defs>
          <linearGradient id="smb-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e8112d" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#e8112d" stopOpacity="0" />
          </linearGradient>
        </defs>
        {grid.map((gy, i) => (
          <line key={i} x1="0" y1={gy} x2={W} y2={gy} stroke="#e6e6e8" strokeWidth="1" />
        ))}
        <path d={area} fill="url(#smb-area)" />
        <path d={line} fill="none" stroke="#e8112d" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={last.x} cy={last.y} r="4.5" fill="#e8112d" stroke="#ffffff" strokeWidth="2.5" />
      </svg>
      <div className="mt-1.5 flex shrink-0 justify-between px-1">
        {points.map((p, i) => (
          <div key={i} className="text-center">
            <div className="text-[10px] uppercase tracking-wide text-faint">{p.label}</div>
            <div className="text-[11px] tabnum text-muted">
              {new Intl.NumberFormat("id-ID").format(Math.round(p.value / 1_000_000))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- "Almost ready" notice when the DB key isn't set yet ---------- */
export function NotConfigured() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-bg px-4">
      <div className="card max-w-md p-6 text-center">
        <Logo imgClassName="h-8" onLight className="mx-auto mb-4" />
        <h1 className="text-lg font-bold">Dashboard hampir siap</h1>
        <p className="mt-2 text-sm text-muted">
          Tinggal satu langkah: admin menambahkan variabel{" "}
          <span className="tabnum rounded bg-surface-2 px-1.5 py-0.5 text-text">
            SUPABASE_SERVICE_ROLE_KEY
          </span>{" "}
          di Railway → Variables. Setelah tersimpan, halaman ini otomatis aktif.
        </p>
      </div>
    </div>
  );
}

/* ---------- Proportional bar (rankings) ---------- */
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
