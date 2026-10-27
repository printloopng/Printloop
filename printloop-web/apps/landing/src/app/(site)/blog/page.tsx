import type { Metadata } from "next";
import Link from "next/link";
import { Reveal, formatDate } from "@printloop/ui";
import { Accent, PageHero } from "@/components/PageHero";
import { listPosts } from "@/lib/blog";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Blog",
  description: "Guides, updates and print-shop truths from the PrintLoop team.",
};

export default async function BlogPage() {
  const posts = await listPosts();
  return (
    <PageHero
      kicker="THE PRINTLOOP DISPATCH"
      title={
        <>
          Guides, updates and <Accent>print-shop truths.</Accent>
        </>
      }
      lede="How the loop works, what we're building, and why your lab printer is the way it is."
    >
      <div className="mt-10">
        {posts.length === 0 ? <div className="border-4 border-ink p-10 text-center text-fog italic pl-serif">No posts yet. Check back soon.</div> : null}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {posts.map((p, i) => {
            const dark = i % 3 === 0;
            return (
              <Reveal key={p.id} variant="rise">
                <Link
                  href={`/blog/${p.slug}`}
                  className={`block h-full border-4 border-ink p-6 transition-all hover:-translate-y-1 hover:shadow-[6px_6px_0_#1A1410] ${dark ? "bg-ink text-paper" : "bg-paper-light"}`}
                >
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <span className="editorial-label text-persimmon">§ {String(i + 1).padStart(2, "0")}</span>
                    <span className={`pl-mono text-[10px] ${dark ? "text-paper/50" : "text-ink/40"}`}>{p.publishedAt ? formatDate(p.publishedAt) : ""}</span>
                  </div>
                  <h2 className="pl-serif text-xl sm:text-2xl font-bold tracking-tight mb-3">{p.title}</h2>
                  {p.excerpt ? <p className={`pl-serif italic text-sm leading-relaxed mb-5 ${dark ? "text-paper/65" : "text-ink/60"}`}>{p.excerpt}</p> : null}
                  <div className="flex items-center justify-between">
                    <span className={`text-[11px] font-bold ${dark ? "text-paper/70" : "text-ink/55"}`}>
                      {p.authorName || "PrintLoop"}
                      {p.tags?.length ? ` · ${p.tags.join(" · ")}` : ""}
                    </span>
                    <span className="text-persimmon font-bold text-xs">READ →</span>
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </div>
    </PageHero>
  );
}
