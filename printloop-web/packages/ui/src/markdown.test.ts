import { describe, expect, it } from "vitest";
import { markdownToHtml } from "./markdown";

describe("markdownToHtml", () => {
  it("escapes raw HTML", () => {
    expect(markdownToHtml('<script>alert("x")</script>')).toBe("<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>");
  });

  it("renders headings, emphasis and code", () => {
    expect(markdownToHtml("# Title\n\nSome **bold**, *soft* and `code`.")).toBe("<h2>Title</h2>\n<p>Some <strong>bold</strong>, <em>soft</em> and <code>code</code>.</p>");
  });

  it("groups bullet and numbered lists separately", () => {
    expect(markdownToHtml("- a\n- b\n\n1. one\n2. two")).toBe("<ul><li>a</li><li>b</li></ul>\n<ol><li>one</li><li>two</li></ol>");
  });

  it("only links safe destinations", () => {
    expect(markdownToHtml("[ok](https://printloop.app/x)")).toContain('href="https://printloop.app/x" target="_blank" rel="noopener noreferrer"');
    expect(markdownToHtml("[home](/pricing)")).toContain('<a href="/pricing">home</a>');
    expect(markdownToHtml("[bad](javascript:alert(1))")).toBe("<p>bad</p>");
    expect(markdownToHtml("[bad](//evil.example)")).toBe("<p>bad</p>");
  });
});
