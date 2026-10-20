import type { Metadata } from "next";
import { EditDetail } from "./EditDetail";

export const metadata: Metadata = { title: "Edit request" };

export default async function EditPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <EditDetail jobId={jobId} />;
}
