import type { Metadata } from "next";
import { PageHeader } from "@printloop/ui";
import { BatchPrint } from "./BatchPrint";

export const metadata: Metadata = { title: "Batch print" };

export default function BatchPrintPage() {
  return (
    <>
      <PageHeader
        kicker="Batch print"
        title={
          <>
            Several documents, <em className="text-persimmon">one code</em>.
          </>
        }
        description="Set options per file, pay once, and release the whole stack at the printer."
      />
      <BatchPrint />
    </>
  );
}
