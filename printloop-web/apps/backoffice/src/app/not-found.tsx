import Link from "next/link";
import { SystemPage } from "@printloop/ui";

export default function NotFound() {
  return (
    <SystemPage
      code="404"
      title="That page isn't here"
      message="The link may be old, or the record was deleted."
      action={
        <Link href="/" className="pl-btn-primary">
          Back to the overview
        </Link>
      }
    />
  );
}
