import Link from "next/link";
import { SystemPage } from "@printloop/ui";

export default function NotFound() {
  return (
    <SystemPage
      code="404"
      title="That page isn't here"
      message="The link may be old, or the page moved."
      action={
        <Link href="/" className="pl-btn-primary">
          Go home
        </Link>
      }
    />
  );
}
