"use client";

import type { CSSProperties } from "react";
import { useInView } from "@printloop/ui";

const WORDS: Array<{ w?: string; br?: boolean; cls?: string }> = [
  { w: "Your" },
  { w: "campus" },
  { w: "printing," },
  { br: true },
  { w: "finally", cls: "italic text-persimmon font-semibold" },
  { w: "done" },
  { w: "right." },
];

export function HeroTitle() {
  const { ref, shown } = useInView<HTMLHeadingElement>({ threshold: 0.2 });
  return (
    <h1
      ref={ref}
      data-shown={shown ? "" : undefined}
      className="pl-typeset pl-serif font-extrabold text-[40px] leading-[1.02] sm:text-[56px] sm:leading-[0.98] lg:text-[78px] lg:leading-[0.92] tracking-tight mb-4 sm:mb-5 max-w-4xl"
    >
      {WORDS.map((t, i) =>
        t.br ? (
          <br key={i} />
        ) : (
          <span key={i}>
            <span className={`pl-word ${t.cls ?? ""}`} style={{ "--w": i } as CSSProperties}>
              {t.w}
            </span>{" "}
          </span>
        ),
      )}
    </h1>
  );
}
