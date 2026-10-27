import { publicGet, publicGetOrNull, type BlogPost } from "./api";

export async function listPosts(limit = 24): Promise<BlogPost[]> {
  try {
    const data = await publicGet<{ posts: BlogPost[] }>(`/blog?limit=${limit}`, { revalidate: 300, tags: ["blog"] });
    return data.posts;
  } catch {
    return [];
  }
}

export function getPost(slug: string): Promise<BlogPost | null> {
  return publicGetOrNull<BlogPost>(`/blog/${encodeURIComponent(slug)}`, { revalidate: 300, tags: ["blog", `blog:${slug}`] });
}
