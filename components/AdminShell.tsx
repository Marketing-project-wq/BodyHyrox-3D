"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Tag,
  Receipt,
  CalendarDays,
  DollarSign,
  Settings,
  Search,
  Bell,
  Menu,
  X,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { ROLE_LABEL, type Role } from "@/lib/config";
import { initials } from "@/lib/format";
import { logout } from "@/app/admin/actions";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
};

export function AdminShell({
  session,
  counts,
  dataPer,
  children,
}: {
  session: { nama: string; role: Role };
  counts: { athletes: number; brands: number };
  dataPer: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const nav: NavItem[] = [
    { href: "/admin", label: "Overview", icon: LayoutDashboard },
    { href: "/admin/atlet", label: "Athletes", icon: Users, badge: counts.athletes },
    { href: "/admin/brand", label: "Brands", icon: Tag, badge: counts.brands },
    { href: "/admin/transaksi", label: "Transactions", icon: Receipt },
    { href: "/admin/event", label: "Events", icon: CalendarDays },
    { href: "/admin/harga-zona", label: "Zone Pricing", icon: DollarSign },
    { href: "/admin/pengaturan", label: "Settings", icon: Settings },
  ];

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
  const current = nav.find((n) => isActive(n.href));

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/admin/atlet?q=${encodeURIComponent(term)}` : "/admin/atlet");
    setOpen(false);
  }

  return (
    <div className="bg-bg lg:h-[100dvh] lg:overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[250px] flex-col bg-sidebar text-sidebar-text transition-transform lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-1 font-condensed text-2xl font-bold tracking-tight text-white">
            <span>2</span>
            <span className="inline-block h-[0.5em] w-[0.5em] rounded-full bg-accent" />
            <span>FIT</span>
          </div>
          <button className="text-sidebar-faint lg:hidden" onClick={() => setOpen(false)} aria-label="Tutup menu">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          <div className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-faint">
            Manage
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

        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-3 px-2 py-1.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
              {initials(session.nama)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{session.nama}</div>
              {session.nama !== ROLE_LABEL[session.role] && (
                <div className="text-xs text-sidebar-faint">{ROLE_LABEL[session.role]}</div>
              )}
            </div>
            <form action={logout}>
              <button className="text-sidebar-faint transition-colors hover:text-accent" aria-label="Keluar" title="Keluar">
                <LogOut size={18} />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Scrim (mobile) */}
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main column */}
      <div className="lg:flex lg:h-full lg:flex-col lg:pl-[250px]">
        <header className="sticky top-0 z-20 flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-2.5 md:px-5">
          <button className="text-muted lg:hidden" onClick={() => setOpen(true)} aria-label="Buka menu">
            <Menu size={22} />
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-sans text-lg font-bold leading-tight text-text">
              {current?.label ?? "Overview"}
            </h1>
            {pathname === "/admin" && (
              <p className="truncate text-[11px] tabnum text-muted">Data per {dataPer}</p>
            )}
          </div>

          <form onSubmit={submitSearch} className="relative ml-auto w-full max-w-xs">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari atlet, brand, transaksi…"
              className="input pl-9"
            />
          </form>

          <button className="relative shrink-0 rounded-lg border border-border p-2 text-muted hover:text-text" aria-label="Notifikasi">
            <Bell size={18} />
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
          </button>
        </header>

        <main className="p-4 md:p-5 lg:min-h-0 lg:flex-1 lg:overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
