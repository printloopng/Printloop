import type { Metadata } from "next";
import { EditReview } from "./EditReview";

export const metadata: Metadata = { title: "Review your edit" };

export default async function EditReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditReview jobId={id} />;
}
