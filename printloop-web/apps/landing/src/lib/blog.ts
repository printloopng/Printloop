import { publicGet, publicGetOrNull, type BlogPost } from "./api";

const PAGE = 50;

export async function listPosts(limit = 24, offset = 0): Promise<BlogPost[]> {
  try {
    const size = Math.min(PAGE, Math.max(1, limit));
    const data = await publicGet<{ posts: BlogPost[] }>(`/blog?limit=${size}&offset=${offset}`, { revalidate: 300, tags: ["blog"] });
    return data.posts;
  } catch {
    return [];
  }
}

export async function listAllPosts(max = 500): Promise<BlogPost[]> {
  const all: BlogPost[] = [];
  while (all.length < max) {
    const page = await listPosts(PAGE, all.length);
    all.push(...page);
    if (page.length < PAGE) break;
  }
  return all;
}

export function getPost(slug: string): Promise<BlogPost | null> {
  return publicGetOrNull<BlogPost>(`/blog/${encodeURIComponent(slug)}`, { revalidate: 300, tags: ["blog", `blog:${slug}`] });
}
