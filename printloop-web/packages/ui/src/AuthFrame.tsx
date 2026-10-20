import type { ReactNode } from "react";
import { EditorialFooter, Marquee } from "./scrollFx";
import { Wordmark } from "./Layout";

const DEFAULT_TAPE = [
  { text: "● STATIONS LIVE ACROSS CAMPUS", accent: true },
  { text: "★ PAY ONCE · PRINT ANYWHERE" },
  { text: "UNILAG · UI · OAU · LASU · COVENANT · UNN" },
  { text: "● CODES VALID 24 HOURS", accent: true },
  { text: "GROUP PRINTING · EDIT & PRINT" },
  { text: "VOL. II · LAGOS" },
];

export function AuthFrame({
  kicker,
  title,
  lede,
  children,
  brand,
  suffix,
  tape = DEFAULT_TAPE,
}: {
  kicker: string;
  title: ReactNode;
  lede?: ReactNode;
  children: ReactNode;
  brand?: ReactNode;
  suffix?: string;
  tape?: { text: string; accent?: boolean }[];
}) {
  return (
    <div className="min-h-screen flex flex-col bg-paper">
      <Marquee items={tape} />
      <header className="px-4 sm:px-8 py-4 border-b-2 border-ink flex items-center justify-between">
        {brand ?? <Wordmark suffix={suffix} />}
        <span className="pl-mono text-[11px] text-ink/50 hidden sm:inline">SECURE SIGN-IN</span>
      </header>
      <main className="flex-1 grid lg:grid-cols-[1.05fr_1fr]">
        <section className="hidden lg:flex flex-col justify-between bg-ink text-paper p-12 relative overflow-hidden">
          <div>
            <div className="editorial-label text-persimmon">{kicker}</div>
            <h1 className="mt-4 font-serif text-5xl xl:text-6xl font-extrabold leading-[1.02] tracking-tight">{title}</h1>
            {lede ? <p className="mt-5 font-serif italic text-paper/70 text-lg max-w-md">{lede}</p> : null}
          </div>
          <div className="flex items-end justify-between">
            <span className="editorial-folio text-ochre">No. 02 — The print desk</span>
            <span className="pl-ornament text-ochre text-4xl" aria-hidden="true">
              ❦
            </span>
          </div>
          <div
            aria-hidden="true"
            className="absolute -right-24 -bottom-24 w-72 h-72 rounded-full border-[18px] border-persimmon/20"
          />
        </section>
        <section className="flex items-start lg:items-center justify-center px-4 sm:px-8 py-8 sm:py-14">
          <div className="w-full max-w-md">
            <div className="lg:hidden mb-6">
              <div className="editorial-label text-persimmon">{kicker}</div>
              <h1 className="mt-2 font-serif text-3xl font-extrabold leading-tight tracking-tight">{title}</h1>
            </div>
            <div className="border-2 border-ink rounded-lg bg-paper-light p-6 sm:p-8 shadow-brutal">{children}</div>
          </div>
        </section>
      </main>
      <EditorialFooter inverse />
    </div>
  );
}
