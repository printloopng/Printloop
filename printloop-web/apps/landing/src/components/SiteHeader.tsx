import Link from "next/link";
import { ScrollProgress } from "@printloop/ui";
import { LINKS, NAV } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40">
      <div className="bg-paper border-b-2 border-ink px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <Link href="/" className="font-serif font-extrabold text-[22px] sm:text-[26px] lg:text-[28px] tracking-tight" aria-label="PrintLoop home">
          PrintLoop<span className="text-persimmon">.</span>
        </Link>
        <nav aria-label="Main" className="order-3 sm:order-none w-full sm:w-auto flex items-center gap-1 overflow-x-auto">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-[11px] sm:text-xs font-bold tracking-editorial uppercase px-2.5 py-1.5 whitespace-nowrap border-2 border-transparent text-ink/70 hover:text-ink hover:border-persimmon transition-all"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="flex gap-2">
          <a href={LINKS.signIn} className="pl-btn-ghost text-[11px] sm:text-xs px-3 sm:px-4 py-2">
            SIGN IN
          </a>
          <a href={LINKS.register} className="pl-btn-primary text-[11px] sm:text-xs px-3 sm:px-4 py-2">
            REGISTER <span className="hidden sm:inline">→</span>
          </a>
        </div>
      </div>
      <ScrollProgress />
    </header>
  );
}
