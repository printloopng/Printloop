import Link from "next/link";
import type { ReactNode } from "react";

export const LEGAL_UPDATED = "2026-10-27";

export function LegalPage({ title, children, other }: { title: string; children: ReactNode; other: { href: string; label: string } }) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 sm:py-20 space-y-10">
      <header>
        <div className="editorial-label text-persimmon mb-2">▸ LEGAL</div>
        <h1 className="pl-serif font-extrabold text-4xl sm:text-5xl tracking-tight">{title}</h1>
        <p className="text-sm text-ink/60 mt-2">Last updated: {LEGAL_UPDATED}</p>
      </header>
      <div className="prose max-w-none">{children}</div>
      <footer className="border-t-2 border-ink pt-8 text-center text-sm text-ink/60">
        <Link href={other.href} className="text-persimmon underline hover:text-persimmon/80 mr-4">
          {other.label}
        </Link>
        <Link href="/contact" className="text-persimmon underline hover:text-persimmon/80">
          Contact us
        </Link>
      </footer>
    </div>
  );
}

export function Mail({ to }: { to: string }) {
  return (
    <a href={`mailto:${to}`} className="text-persimmon underline">
      {to}
    </a>
  );
}
