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
  children,
}: {
  session: { nama: string; role: Role };
  counts: { athletes: number; brands: number };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const nav: NavItem[] = [
    { href: "/admin", label: "Overview", icon: LayoutDashboard },
    { href: "/admin/atlet", label: "Atlet", icon: Users, badge: counts.athletes },
    { href: "/admin/brand", label: "Brand", icon: Tag, badge: counts.brands },
    { href: "/admin/transaksi", label: "Transaksi", icon: Receipt },
    { href: "/admin/event", label: "Event", icon: CalendarDays },
    { href: "/admin/harga-zona", label: "Harga Zona", icon: DollarSign },
    { href: "/admin/pengaturan", label: "Pengaturan", icon: Settings },
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
    <div className="min-h-screen bg-bg">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[250px] flex-col border-r border-border bg-surface transition-transform lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <span className="font-display text-xl font-bold tracking-tight">
            2<span className="text-accent">0</span>FIT
          </span>
          <button
            className="text-muted lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Tutup menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2">
          <div className="eyebrow px-3 pb-2 pt-1">Kelola</div>
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
                <Icon size={18} className={active ? "text-accent" : ""} />
                <span className="flex-1">{item.label}</span>
                {item.badge != null && (
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] tabnum text-muted">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">
              {initials(session.nama)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-text">{session.nama}</div>
              <div className="text-xs text-faint">{ROLE_LABEL[session.role]}</div>
            </div>
            <form action={logout}>
              <button
                className="text-faint transition-colors hover:text-accent"
                aria-label="Keluar"
                title="Keluar"
              >
                <LogOut size={18} />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Scrim (mobile) */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main column */}
      <div className="lg:pl-[250px]">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-bg/90 px-4 py-3 backdrop-blur md:px-6">
          <button
            className="text-muted lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Buka menu"
          >
            <Menu size={22} />
          </button>
          <div className="hidden text-sm text-muted sm:block">
            <span className="text-faint">Kelola</span>
            <span className="mx-2 text-faint">/</span>
            <span className="font-medium text-text">{current?.label ?? "Overview"}</span>
          </div>

          <form onSubmit={submitSearch} className="relative ml-auto w-full max-w-xs">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari atlet, brand, transaksi…"
              className="input pl-9"
            />
          </form>

          <button
            className="relative shrink-0 rounded-lg border border-border p-2 text-muted hover:text-text"
            aria-label="Notifikasi"
          >
            <Bell size={18} />
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
          </button>
        </header>

        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
