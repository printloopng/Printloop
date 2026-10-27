import Link from "next/link";
import { EditorialFooter } from "@printloop/ui";
import { FOOTER_COLUMNS } from "@/lib/footer-links";

export function SiteFooter() {
  return (
    <>
      <div className="bg-paper border-t-2 border-ink">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-2 md:grid-cols-4 gap-8">
          {FOOTER_COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <div className="editorial-label text-persimmon mb-3">{col.title}</div>
              <ul className="space-y-2 text-sm">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.external ? (
                      <a href={l.href} className="hover:text-persimmon">
                        {l.label}
                      </a>
                    ) : (
                      <Link href={l.href} className="hover:text-persimmon">
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </div>
      <EditorialFooter />
    </>
  );
}
