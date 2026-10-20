import type { Metadata } from "next";
import { PageHeader } from "@printloop/ui";
import { NewPrintWizard } from "./NewPrintWizard";

export const metadata: Metadata = { title: "New print" };

export default function NewPrintPage() {
  return (
    <>
      <PageHeader
        kicker="New print"
        title={
          <>
            Upload, price, <em className="text-persimmon">collect</em>.
          </>
        }
        description="Your code stays valid for 24 hours. Pay once, securely, with Paystack."
      />
      <NewPrintWizard />
    </>
  );
}
