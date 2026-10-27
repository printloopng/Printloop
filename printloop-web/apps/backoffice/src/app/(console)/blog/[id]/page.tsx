import type { Metadata } from "next";
import { EditPost } from "./EditPost";

export const metadata: Metadata = { title: "Edit post" };

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditPost id={id} />;
}
