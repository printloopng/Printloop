import type { Metadata } from "next";
import { EditorWorkspace } from "./EditorWorkspace";

export const metadata: Metadata = { title: "Editor" };

export default async function EditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ job?: string }>;
}) {
  const [{ sessionId }, { job }] = await Promise.all([params, searchParams]);
  return <EditorWorkspace sessionId={sessionId} jobId={job ?? null} />;
}
