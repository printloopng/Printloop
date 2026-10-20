import type { CSSProperties, ReactNode } from "react";

interface TextStyle {
  fs?: number;
  bl?: number;
  it?: number;
  ul?: { s?: number };
  st?: { s?: number };
  cl?: { rgb?: string };
}

interface UniverDoc {
  body?: {
    dataStream?: string;
    textRuns?: Array<{ st: number; ed: number; ts?: TextStyle }>;
    paragraphs?: Array<{ startIndex: number; paragraphStyle?: { horizontalAlign?: number } }>;
  };
}

const ALIGN: Record<number, CSSProperties["textAlign"]> = { 1: "left", 2: "center", 3: "right", 4: "justify" };

function styleOf(ts: TextStyle | undefined): CSSProperties {
  if (!ts) return {};
  const deco = [ts.ul?.s ? "underline" : "", ts.st?.s ? "line-through" : ""].filter(Boolean).join(" ");
  return {
    fontSize: ts.fs ? `${ts.fs}pt` : undefined,
    fontWeight: ts.bl ? 700 : undefined,
    fontStyle: ts.it ? "italic" : undefined,
    textDecoration: deco || undefined,
    color: ts.cl?.rgb && /^#[0-9a-f]{3,8}$/i.test(ts.cl.rgb) ? ts.cl.rgb : undefined,
  };
}

export function UniverText({ document }: { document: unknown }) {
  const doc = document as UniverDoc | null;
  const ds = doc?.body?.dataStream ?? "";
  if (!ds.trim()) return <p className="text-sm text-fog italic">The document is empty so far.</p>;
  const runs = [...(doc?.body?.textRuns ?? [])].sort((a, b) => a.st - b.st);
  const aligns = new Map((doc?.body?.paragraphs ?? []).map((p) => [p.startIndex, p.paragraphStyle?.horizontalAlign]));
  const paragraphs: ReactNode[] = [];
  let start = 0;
  for (let i = 0; i < ds.length; i++) {
    if (ds[i] !== "\r") continue;
    const parts: ReactNode[] = [];
    let cursor = start;
    for (const run of runs) {
      if (run.ed <= start || run.st >= i) continue;
      const st = Math.max(run.st, start);
      const ed = Math.min(run.ed, i);
      if (st > cursor) parts.push(ds.slice(cursor, st));
      parts.push(
        <span key={`${st}-${ed}`} style={styleOf(run.ts)}>
          {ds.slice(st, ed)}
        </span>,
      );
      cursor = ed;
    }
    if (cursor < i) parts.push(ds.slice(cursor, i));
    paragraphs.push(
      <p key={start} style={{ textAlign: ALIGN[aligns.get(i) ?? 1] }} className="mb-2 whitespace-pre-wrap min-h-[1em]">
        {parts.length ? parts : " "}
      </p>,
    );
    start = i + 1;
  }
  return <div className="bg-white border-2 border-ink p-6 sm:p-10 font-serif text-[12pt] leading-relaxed text-ink shadow-soft">{paragraphs}</div>;
}
