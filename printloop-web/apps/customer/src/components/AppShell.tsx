"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, Home, Layers, LogOut, MapPin, Plus, Printer, Settings, Store, Users } from "lucide-react";
import { cx, initials, Wordmark } from "@printloop/ui";
import { signOut } from "@printloop/auth/client";
import type { SessionUser } from "@printloop/auth/config";
import { useShop } from "@/lib/shop-context";

const NAV = [
  { href: "/", label: "Home", icon: Home, exact: true },
  { href: "/print/new", label: "Print", icon: Plus },
  { href: "/jobs", label: "Jobs", icon: FileText },
  { href: "/groups", label: "Groups", icon: Users },
  { href: "/stations", label: "Stations", icon: Printer },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function ShopChip() {
  const shop = useShop();
  if (!shop) {
    return (
      <Link
        href="/shops"
        className="pl-nav-link inline-flex items-center gap-2 border-2 border-dashed border-ink/50 px-3 py-1.5 text-xs font-bold tracking-editorial uppercase hover:border-ink"
      >
        <MapPin size={14} /> Choose a shop
      </Link>
    );
  }
  const body = (
    <>
      {shop.logoUrl ? (
        <img src={shop.logoUrl} alt="" className="h-6 w-6 object-contain bg-white border border-ink" />
      ) : (
        <span className="h-6 w-6 grid place-items-center bg-brand text-paper text-xs font-bold">{shop.name.charAt(0)}</span>
      )}
      <span className="max-w-[10rem] truncate">{shop.name}</span>
    </>
  );
  if (shop.fromHost) {
    return <span className="inline-flex items-center gap-2 text-sm font-bold">{body}</span>;
  }
  return (
    <Link
      href="/shops"
      title="Switch shop"
      className="pl-nav-link inline-flex items-center gap-2 border-2 border-ink px-2.5 py-1 text-sm font-bold bg-paper-light"
    >
      {body}
      <Store size={14} className="text-ink/50" />
    </Link>
  );
}

function UserMenu({ user }: { user: SessionUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="h-9 w-9 grid place-items-center border-2 border-ink bg-ink text-paper font-bold text-sm hover:bg-persimmon transition-colors"
      >
        {initials(user.firstName, user.lastName)}
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 border-2 border-ink bg-paper shadow-brutal z-50 animate-fadein"
        >
          <div className="px-4 py-3 border-b-2 border-ink/10">
            <div className="font-bold text-sm truncate">
              {user.firstName} {user.lastName}
            </div>
            <div className="text-xs text-fog truncate">{user.email}</div>
          </div>
          <Link role="menuitem" href="/settings" className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-paper-warm" onClick={() => setOpen(false)}>
            <Settings size={15} /> Settings
          </Link>
          <Link role="menuitem" href="/print/batch" className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-paper-warm" onClick={() => setOpen(false)}>
            <Layers size={15} /> Batch print
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={() => signOut("/login")}
            className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-persimmon hover:bg-paper-warm border-t-2 border-ink/10"
          >
            <LogOut size={15} /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen flex flex-col pb-20 md:pb-0">
      <div className="h-1 bg-brand" aria-hidden="true" />
      <header className="sticky top-0 z-40 bg-paper/95 backdrop-blur border-b-2 border-ink">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center gap-4">
          <Link href="/" className="shrink-0" aria-label="PrintLoop home">
            <Wordmark className="text-[20px]" />
          </Link>
          <div className="hidden sm:block">
            <ShopChip />
          </div>
          <nav className="hidden md:flex items-center gap-1 ml-auto" aria-label="Main">
            {NAV.map((item) => {
              const active = isActive(pathname, item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "pl-nav-link px-3 py-1.5 text-[11px] font-bold tracking-editorial uppercase border-2",
                    active ? "bg-ink text-paper border-ink" : "border-transparent text-ink/65 hover:text-ink",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto md:ml-2">
            <UserMenu user={user} />
          </div>
        </div>
        <div className="sm:hidden px-4 pb-2">
          <ShopChip />
        </div>
      </header>

      {!user.isEmailVerified ? (
        <div className="bg-ochre/15 border-b-2 border-ochre">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-2.5 text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-bold">Confirm your email</span>
            <span className="text-ink/70">so we can send receipts and print codes.</span>
            <Link href="/verify-email" className="pl-link font-semibold">
              Enter code
            </Link>
          </div>
        </div>
      ) : null}

      <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 sm:py-10">{children}</main>

      <nav
        aria-label="Main"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-paper border-t-2 border-ink grid grid-cols-5"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href, item.exact);
          const primary = item.href === "/print/new";
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-bold tracking-editorial uppercase",
                primary ? "bg-persimmon text-paper" : active ? "text-persimmon" : "text-ink/60",
              )}
            >
              <Icon size={20} strokeWidth={2.25} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
