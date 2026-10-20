"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, buttonClass } from "@printloop/ui";
import { jobAmount, nextAction, type Job } from "@/lib/jobs";
import { useCheckout } from "@/lib/queries";
import { ReleaseDialog } from "./ReleaseDialog";

export function JobActions({ job, size = "sm" }: { job: Job; size?: "sm" | "md" }) {
  const checkout = useCheckout();
  const [paying, setPaying] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const action = nextAction(job);

  if (action === "pay") {
    return (
      <Button
        size={size}
        loading={paying}
        onClick={async () => {
          setPaying(true);
          await checkout(job.id);
          setPaying(false);
        }}
      >
        Pay ₦{jobAmount(job).toLocaleString("en-NG")}
      </Button>
    );
  }
  if (action === "release") {
    return (
      <>
        <Button size={size} variant="dark" onClick={() => setReleasing(true)} arrow>
          Send to printer
        </Button>
        <ReleaseDialog jobId={job.id} open={releasing} onOpenChange={setReleasing} />
      </>
    );
  }
  if (action === "review-edit") {
    return (
      <Link href={`/jobs/${job.id}/edit`} className={buttonClass("primary", size)}>
        Review edit <span className="pl-arrow">→</span>
      </Link>
    );
  }
  return (
    <Link href={`/jobs/${job.id}`} className={buttonClass("ghost", size)}>
      Details
    </Link>
  );
}
