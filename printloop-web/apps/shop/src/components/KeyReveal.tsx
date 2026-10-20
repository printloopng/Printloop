"use client";

import { Copy, KeyRound } from "lucide-react";
import { Button, Dialog, Notice, toast } from "@printloop/ui";

export function KeyReveal({ apiKey, title, onClose }: { apiKey: string | null; title: string; onClose: () => void }) {
  return (
    <Dialog
      open={Boolean(apiKey)}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description="Copy this key now. For security we never show it again."
      dismissible={false}
      footer={
        <Button size="sm" onClick={onClose}>
          I&apos;ve saved it
        </Button>
      }
    >
      <div className="flex items-center gap-2 border-2 border-ink bg-ink text-paper p-3">
        <KeyRound size={16} className="text-persimmon shrink-0" />
        <code className="pl-mono text-xs break-all flex-1">{apiKey}</code>
        <button
          type="button"
          aria-label="Copy key"
          className="shrink-0 hover:text-persimmon"
          onClick={async () => {
            await navigator.clipboard.writeText(apiKey ?? "");
            toast.success("Key copied.");
          }}
        >
          <Copy size={16} />
        </button>
      </div>
      <ol className="mt-5 space-y-2 text-sm list-decimal pl-5">
        <li>On the computer connected to your printer, open the PrintLoop Kiosk app.</li>
        <li>
          Open <strong>Settings</strong>, paste the key, and pick the printer.
        </li>
        <li>Press <strong>Connect</strong>. The kiosk shows as online here within 10 seconds.</li>
      </ol>
      <div className="mt-4">
        <Notice tone="warn">Anyone with this key can receive your print jobs. Rotate it if it leaks.</Notice>
      </div>
    </Dialog>
  );
}
