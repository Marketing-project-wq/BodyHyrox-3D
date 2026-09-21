"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Tag,
  Receipt,
  CalendarDays,
  DollarSign,
  Settings,
  Menu,
  X,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/config";
import { type Dict, type Locale, tRole } from "@/lib/i18n";
import { initials } from "@/lib/format";
import { logout } from "@/app/admin/actions";
import { LangToggle } from "@/components/LangToggle";
import { Logo } from "@/components/ui";

export function AdminShell({
  session,
  counts,
  m,
  locale,
  children,
}: {
  session: { nama: string; role: Role };
  counts: { athletes: number; brands: number };
  m: Dict;
  locale: Locale;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav: { href: string; label: string; icon: LucideIcon; badge?: number }[] = [
    { href: "/admin", label: m.nav_overview, icon: LayoutDashboard },
    { href: "/admin/atlet", label: m.nav_athletes, icon: Users, badge: counts.athletes },
    { href: "/admin/brand", label: m.nav_brands, icon: Tag, badge: counts.brands },
    { href: "/admin/transaksi", label: m.nav_transactions, icon: Receipt },
    { href: "/admin/event", label: m.nav_events, icon: CalendarDays },
    { href: "/admin/harga-zona", label: m.nav_zonePricing, icon: DollarSign },
    { href: "/admin/pengaturan", label: m.nav_settings, icon: Settings },
  ];

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const roleLabel = tRole(m, session.role);

  return (
    <div className="bg-bg lg:h-[100dvh] lg:overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[250px] flex-col bg-sidebar text-sidebar-text transition-transform lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <Logo imgClassName="h-6" />
          <button className="text-sidebar-faint lg:hidden" onClick={() => setOpen(false)} aria-label="Menu">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          <div className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-faint">
            {m.manage}
          </div>
          {nav.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`nav-item ${active ? "nav-item-active" : ""}`}
              >
                <Icon size={18} />
                <span className="flex-1">{item.label}</span>
                {item.badge != null && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] tabnum ${
                      active ? "bg-white/20 text-white" : "bg-white/10 text-sidebar-text"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-2 border-t border-white/10 p-3">
          <LangToggle locale={locale} />
          <div className="flex items-center gap-3 px-2 py-1">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
              {initials(session.nama)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{session.nama}</div>
              {session.nama !== roleLabel && (
                <div className="text-xs text-sidebar-faint">{roleLabel}</div>
              )}
            </div>
            <form action={logout}>
              <button className="text-sidebar-faint transition-colors hover:text-accent" aria-label={m.logout} title={m.logout}>
                <LogOut size={18} />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Scrim (mobile) */}
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main column (no topbar) */}
      <div className="lg:flex lg:h-full lg:flex-col lg:pl-[250px]">
        <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-sidebar px-4 py-2.5 lg:hidden">
          <button className="text-white" onClick={() => setOpen(true)} aria-label="Menu">
            <Menu size={22} />
          </button>
          <Logo imgClassName="h-5" />
        </div>

        <main className="p-4 md:p-5 lg:min-h-0 lg:flex-1 lg:overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
