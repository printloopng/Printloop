import type { MetadataRoute } from "next";
import { listAllPosts } from "@/lib/blog";
import { publicGet, type ShopSummary } from "@/lib/api";
import { SITE } from "@/lib/site";

export const dynamic = "force-dynamic";

const STATIC = ["", "/features", "/pricing", "/find", "/about", "/blog", "/contact", "/privacy", "/terms"];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [posts, shops] = await Promise.all([
    listAllPosts(),
    publicGet<{ shops: ShopSummary[] }>("/discovery/shops", { revalidate: 3600 })
      .then((d) => d.shops)
      .catch(() => [] as ShopSummary[]),
  ]);
  return [
    ...STATIC.map((path) => ({ url: `${SITE.baseUrl}${path}`, changeFrequency: "monthly" as const, priority: path === "" ? 1 : 0.6 })),
    ...posts.map((p) => ({ url: `${SITE.baseUrl}/blog/${p.slug}`, lastModified: p.updatedAt ?? p.publishedAt ?? undefined, changeFrequency: "monthly" as const, priority: 0.5 })),
    ...shops.map((s) => ({ url: `${SITE.baseUrl}/find/${s.slug}`, changeFrequency: "daily" as const, priority: 0.5 })),
  ];
}
