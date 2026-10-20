import type { Metadata } from "next";
import { JobDetail } from "./JobDetail";

export const metadata: Metadata = { title: "Job" };

export default async function JobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const [{ id }, { paid }] = await Promise.all([params, searchParams]);
  return <JobDetail id={id} justPaid={paid === "1"} />;
}
