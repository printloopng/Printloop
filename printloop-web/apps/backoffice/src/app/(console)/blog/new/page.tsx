import type { Metadata } from "next";
import { BlogEditor } from "../BlogEditor";

export const metadata: Metadata = { title: "New post" };

export default function NewPostPage() {
  return <BlogEditor post={null} />;
}
