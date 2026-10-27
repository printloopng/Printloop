import type { Metadata } from "next";
import { BlogListView } from "./BlogListView";

export const metadata: Metadata = { title: "Blog" };

export default function BlogPage() {
  return <BlogListView />;
}
