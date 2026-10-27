import type { ReactNode } from "react";
import { Reveal } from "@printloop/ui";

export function PageHero({ kicker, title, lede, children }: { kicker: string; title: ReactNode; lede?: ReactNode; children?: ReactNode }) {
  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20">
      <Reveal variant="rise">
        <div className="editorial-label text-persimmon mb-3">▸ {kicker}</div>
        <h1 className="pl-serif font-extrabold text-[38px] leading-[1.02] sm:text-[54px] sm:leading-[0.98] tracking-tight mb-5 max-w-3xl">{title}</h1>
        {lede ? <p className="pl-serif italic text-ink/60 text-sm sm:text-base max-w-2xl">{lede}</p> : null}
      </Reveal>
      {children}
    </section>
  );
}

export function Accent({ children }: { children: ReactNode }) {
  return <em className="italic text-persimmon font-semibold">{children}</em>;
}

export function Bullets({ items, className = "" }: { items: readonly string[]; className?: string }) {
  return (
    <ul className={`space-y-2 text-sm ${className}`}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2">
          <span aria-hidden className="text-persimmon font-bold mt-px">
            ▸
          </span>
          <span className="font-medium">{item}</span>
        </li>
      ))}
    </ul>
  );
}
