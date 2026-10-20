import type { Metadata } from "next";
import { PageHeader } from "@printloop/ui";
import { EditsView } from "./EditsView";

export const metadata: Metadata = { title: "Edit & Print" };

export default function EditsPage() {
  return (
    <>
      <PageHeader
        kicker="Edit & Print"
        title="Documents to edit"
        description="Customers asked you to fix these before printing. Edit live in the browser or upload a corrected PDF; they approve before paying."
      />
      <EditsView />
    </>
  );
}
