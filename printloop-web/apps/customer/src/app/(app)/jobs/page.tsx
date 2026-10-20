import type { Metadata } from "next";
import { PageHeader } from "@printloop/ui";
import Link from "next/link";
import { JobsView } from "./JobsView";

export const metadata: Metadata = { title: "My jobs" };

export default function JobsPage() {
  return (
    <>
      <PageHeader
        kicker="My jobs"
        title="Every print, recorded."
        description="Codes, payments and live printer progress in one place."
        actions={
          <Link href="/print/new" className="pl-btn-primary pl-btn-sm">
            New print
          </Link>
        }
      />
      <JobsView />
    </>
  );
}
