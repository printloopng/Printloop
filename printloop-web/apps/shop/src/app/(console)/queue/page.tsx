import type { Metadata } from "next";
import { PageHeader } from "@printloop/ui";
import { QueueView } from "./QueueView";

export const metadata: Metadata = { title: "Job queue" };

export default function QueuePage() {
  return (
    <>
      <PageHeader kicker="Operations" title="Job queue" description="Updates every few seconds. Accept marketplace orders, send ready jobs to a printer, and retry failures." />
      <QueueView />
    </>
  );
}
