"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { cx } from "./cx";

export interface ConsoleNavItem {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  exact?: boolean;
  badge?: ReactNode;
}

export interface ConsoleNavGroup {
  label?: string;
  items: ConsoleNavItem[];
}

function active(pathname: string, item: ConsoleNavItem) {
  return item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function Nav({ groups, onNavigate }: { groups: ConsoleNavGroup[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Console" className="space-y-6">
      {groups.map((group, gi) => (
        <div key={group.label ?? gi}>
          {group.label ? <div className="editorial-label text-paper/40 px-3 mb-2">{group.label}</div> : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const on = active(pathname, item);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={on ? "page" : undefined}
                    className={cx(
                      "flex items-center gap-3 px-3 py-2 text-sm font-semibold transition-colors",
                      on ? "bg-persimmon text-paper" : "text-paper/70 hover:text-paper hover:bg-paper/10",
                    )}
                  >
                    <Icon size={17} className="shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.badge ? <span className="shrink-0">{item.badge}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function ConsoleShell({
  brand,
  groups,
  topbar,
  footer,
  banner,
  children,
}: {
  brand: ReactNode;
  groups: ConsoleNavGroup[];
  topbar?: ReactNode;
  footer?: ReactNode;
  banner?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="px-4 h-16 flex items-center border-b-2 border-paper/10">{brand}</div>
      <div className="flex-1 overflow-y-auto px-2 py-5">
        <Nav groups={groups} onNavigate={() => setOpen(false)} />
      </div>
      {footer ? <div className="border-t-2 border-paper/10 p-3">{footer}</div> : null}
    </div>
  );

  return (
    <div className="min-h-screen bg-paper lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="hidden lg:block sticky top-0 h-screen bg-ink text-paper">{sidebar}</aside>
      {open ? (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-ink/60" onClick={() => setOpen(false)} aria-hidden="true" />
          <aside className="absolute inset-y-0 left-0 w-72 bg-ink text-paper shadow-soft-xl animate-fadein">{sidebar}</aside>
        </div>
      ) : null}
      <div className="min-w-0 flex flex-col">
        {banner}
        <header className="sticky top-0 z-30 h-16 bg-paper/95 backdrop-blur border-b-2 border-ink flex items-center gap-3 px-4 sm:px-6">
          <button type="button" className="lg:hidden p-2 -ml-2" aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen((o) => !o)}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div className="flex-1 min-w-0 flex items-center justify-end gap-3">{topbar}</div>
        </header>
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
