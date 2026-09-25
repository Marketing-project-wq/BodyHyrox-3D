import Link from "next/link";
import { brandLogout } from "@/app/brand/actions";

/** Top nav for the signed-in sponsor area (dashboard / cart / account / logout). */
export function BrandAccountNav({
  active,
  cartCount = 0,
  company,
}: {
  active: "dashboard" | "keranjang" | "akun";
  cartCount?: number;
  company?: string;
}) {
  const item = (href: string, key: string, label: string, badge?: number) => (
    <Link
      href={href}
      className={`relative rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
        active === key ? "bg-white/10 text-white" : "text-white/55 hover:text-white"
      }`}
    >
      {label}
      {badge != null && badge > 0 && (
        <span className="ml-1.5 rounded-full bg-[#ff3b57] px-1.5 py-0.5 text-[10px] font-semibold text-white">
          {badge}
        </span>
      )}
    </Link>
  );

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
      <div className="flex flex-wrap items-center gap-1">
        {item("/brand/dashboard", "dashboard", "Dashboard")}
        {item("/brand/keranjang", "keranjang", "Keranjang", cartCount)}
        {item("/brand/akun", "akun", "Akun")}
      </div>
      <div className="flex items-center gap-3">
        {company && <span className="hidden text-xs text-white/40 sm:inline">{company}</span>}
        <form action={brandLogout}>
          <button className="rounded-full border border-white/15 px-3.5 py-1.5 text-sm text-white/70 hover:bg-white/5 hover:text-white">
            Keluar
          </button>
        </form>
      </div>
    </div>
  );
}
