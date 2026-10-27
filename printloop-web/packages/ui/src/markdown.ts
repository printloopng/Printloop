function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function safeHref(raw: string): string | null {
  const url = raw.trim();
  if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url) || (url.startsWith("/") && !url.startsWith("//")) || url.startsWith("#")) return url;
  return null;
}

function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (_m, text: string, href: string) => {
      const safe = safeHref(href.replace(/&amp;/g, "&"));
      if (!safe) return text;
      const external = /^https?:\/\//i.test(safe);
      return `<a href="${esc(safe)}"${external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${text}</a>`;
    });
}

export function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let list: { tag: "ul" | "ol"; items: string[] } | null = null;

  const flushList = () => {
    if (list) {
      out.push(`<${list.tag}>${list.items.map((li) => `<li>${li}</li>`).join("")}</${list.tag}>`);
      list = null;
    }
  };
  const push = (tag: "ul" | "ol", item: string) => {
    if (list && list.tag !== tag) flushList();
    list = list ?? { tag, items: [] };
    list.items.push(item);
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushList();
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushList();
      const level = Math.min(3, heading[1].length + 1);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      flushList();
      out.push("<hr />");
      continue;
    }
    if (line.startsWith("> ")) {
      flushList();
      out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`);
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      push("ul", inline(bullet[1]));
      continue;
    }
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    if (numbered) {
      push("ol", inline(numbered[1]));
      continue;
    }
    flushList();
    out.push(`<p>${inline(line)}</p>`);
  }
  flushList();
  return out.join("\n");
}
