import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Prose, formatDate } from "@printloop/ui";
import { getPost } from "@/lib/blog";
import { LINKS, SITE } from "@/lib/site";

export const revalidate = 300;
export const dynamicParams = true;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = await getPost((await params).slug);
  if (!post) return { title: "Post not found" };
  return {
    title: post.title,
    description: post.excerpt ?? undefined,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: { type: "article", title: post.title, description: post.excerpt ?? undefined, publishedTime: post.publishedAt ?? undefined, images: post.coverImageUrl ? [post.coverImageUrl] : undefined },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const post = await getPost((await params).slug);
  if (!post) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt ?? undefined,
    datePublished: post.publishedAt ?? undefined,
    dateModified: post.updatedAt ?? undefined,
    author: { "@type": "Organization", name: post.authorName || SITE.name },
    image: post.coverImageUrl ?? undefined,
    mainEntityOfPage: `${SITE.baseUrl}/blog/${post.slug}`,
  };

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Link href="/blog" className="editorial-label text-ink/50 hover:text-persimmon">
        ← All posts
      </Link>
      <header className="mt-5 mb-8 border-b-2 border-ink pb-6">
        <h1 className="pl-serif font-extrabold text-[34px] sm:text-5xl leading-[1.05] tracking-tight">{post.title}</h1>
        <p className="mt-3 text-sm text-ink/60">
          {post.authorName || "PrintLoop"}
          {post.publishedAt ? ` · ${formatDate(post.publishedAt)}` : ""}
          {post.tags?.length ? ` · ${post.tags.join(" · ")}` : ""}
        </p>
      </header>
      {post.coverImageUrl ? <img src={post.coverImageUrl} alt="" className="w-full border-2 border-ink mb-8" /> : null}
      <Prose markdown={post.content ?? ""} />
      <aside className="mt-12 border-4 border-ink bg-paper-light p-6 text-center">
        <p className="pl-serif text-lg mb-4">Ready to skip the queue?</p>
        <a href={LINKS.register} className="pl-btn-primary px-6 py-3 text-sm">
          CREATE YOUR ACCOUNT →
        </a>
      </aside>
    </article>
  );
}
