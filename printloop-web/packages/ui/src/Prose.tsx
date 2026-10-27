import { cx } from "./cx";
import { markdownToHtml } from "./markdown";

export function Prose({ markdown, className }: { markdown: string; className?: string }) {
  return <div className={cx("prose max-w-none", className)} dangerouslySetInnerHTML={{ __html: markdownToHtml(markdown) }} />;
}
