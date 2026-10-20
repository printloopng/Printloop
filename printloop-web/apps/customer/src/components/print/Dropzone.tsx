"use client";

import { useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { cx, formatBytes } from "@printloop/ui";

export function Dropzone({
  accept,
  multiple = false,
  onFiles,
  hint,
  files = [],
}: {
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  hint: string;
  files?: File[];
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const picked = Array.from(e.dataTransfer.files);
        if (picked.length) onFiles(multiple ? picked : picked.slice(0, 1));
      }}
      className={cx(
        "border-2 border-dashed p-8 sm:p-12 text-center transition-colors",
        over ? "border-persimmon bg-persimmon/5" : "border-ink/40 hover:bg-paper-light",
      )}
    >
      <FileUp size={36} className="mx-auto text-ochre" />
      <p className="mt-3 font-serif text-xl font-semibold">Drop {multiple ? "files" : "a file"} here</p>
      <p className="mt-1 font-serif italic text-sm text-ink/60">{hint}</p>
      <button type="button" onClick={() => input.current?.click()} className="pl-btn-dark pl-btn-sm mt-5">
        Browse {multiple ? "files" : "your device"}
      </button>
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          if (picked.length) onFiles(picked);
          e.target.value = "";
        }}
      />
      {files.length ? (
        <ul className="mt-5 flex flex-wrap justify-center gap-2">
          {files.map((f) => (
            <li key={`${f.name}-${f.size}`} className="bg-ink text-paper px-3 py-1.5 text-xs font-semibold max-w-full truncate">
              {f.name} · {formatBytes(f.size)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
