"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { QrBlock, formatDateTime, toast } from "@printloop/ui";
import { jobTitle, type Job } from "@/lib/jobs";

export function CodeCard({ job, compact = false }: { job: Job; compact?: boolean }) {
  const [showQr, setShowQr] = useState(!compact);
  if (!job.code) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(job.code!);
      toast.success("Code copied.");
    } catch {
      toast.error("Could not copy the code.");
    }
  };
  return (
    <div className="border-2 border-ink bg-ink text-paper">
      <div className="p-5 sm:p-6 text-center">
        <div className="editorial-label text-persimmon">Print code</div>
        <button
          type="button"
          onClick={copy}
          className="mt-2 inline-flex items-center gap-3 pl-mono text-4xl sm:text-5xl font-bold tracking-[0.15em] hover:text-persimmon"
          aria-label={`Copy code ${job.code}`}
        >
          {job.code}
          <Copy size={18} className="opacity-60" />
        </button>
        <div className="mt-2 font-serif italic text-sm text-paper/70 truncate">{jobTitle(job)}</div>
        {job.expiresAt ? <div className="mt-1 text-xs text-paper/50">Valid until {formatDateTime(job.expiresAt)}</div> : null}
      </div>
      {showQr ? (
        <div className="bg-paper text-ink p-5 flex justify-center border-t-2 border-ink">
          <QrBlock value={job.qrPayload || `printloop://release/${job.code}`} label="Scan at the kiosk" size={150} fileName={`printloop-${job.code}`} />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowQr(true)}
          className="w-full border-t-2 border-paper/20 py-2 text-[11px] font-bold tracking-editorial uppercase text-paper/70 hover:text-paper"
        >
          Show QR
        </button>
      )}
    </div>
  );
}
