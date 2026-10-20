"use client";

import { useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Download, Share2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  value: string;
  caption?: string;
  label?: string;
  size?: number;
  fileName?: string;
};

async function toPng(svg: SVGSVGElement, size: number): Promise<Blob> {
  const xml = new XMLSerializer().serializeToString(svg);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("render failed"));
      img.src = url;
    });
    const pad = Math.round(size * 0.12);
    const canvas = document.createElement("canvas");
    canvas.width = size + pad * 2;
    canvas.height = size + pad * 2;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, pad, pad, size, size);
    return await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("blob failed"))), "image/png"),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function QrBlock({ value, caption, label, size = 150, fileName = "printloop-qr" }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const getSvg = () => wrapRef.current?.querySelector("svg") ?? null;

  const download = async () => {
    const svg = getSvg();
    if (!svg) return;
    try {
      const blob = await toPng(svg, size);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("QR image saved.");
    } catch {
      toast.error("Could not export the QR.");
    }
  };

  const share = async () => {
    const svg = getSvg();
    if (!svg) return;
    try {
      const blob = await toPng(svg, size);
      const file = new File([blob], `${fileName}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "PrintLoop", text: caption ? `${caption} — ${value}` : value });
        return;
      }
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "PrintLoop", text: caption || "PrintLoop code", url: value });
        return;
      }
      await navigator.clipboard.writeText(value);
      toast.success("Link copied — sharing isn't supported on this device.");
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") toast.error("Could not share.");
    }
  };

  return (
    <div className="inline-flex flex-col items-center">
      <div ref={wrapRef} className="bg-white border-2 border-ink p-3">
        <QRCodeSVG value={value} size={size} marginSize={1} level="M" title={caption ?? "QR code"} />
      </div>
      {caption ? <div className="pl-mono text-2xl font-bold mt-3 tracking-wider">{caption}</div> : null}
      {label ? <div className="editorial-label text-ink/60 mt-1">{label}</div> : null}
      <div className="flex gap-2 mt-3">
        <button type="button" onClick={download} className="pl-btn-ghost pl-btn-sm">
          <Download size={13} /> Save PNG
        </button>
        <button type="button" onClick={share} className="pl-btn-primary pl-btn-sm">
          <Share2 size={13} /> Share
        </button>
      </div>
    </div>
  );
}
