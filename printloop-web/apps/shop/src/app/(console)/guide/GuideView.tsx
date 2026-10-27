"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Check, Download } from "lucide-react";
import { Card, Notice, PageHeader, cx } from "@printloop/ui";
import { useApi } from "@printloop/api-client/react";
import { useShopProfile } from "@/lib/shop-context";

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[2.5rem_1fr] gap-4">
      <span
        aria-hidden
        className={cx("h-10 w-10 border-2 border-ink grid place-items-center font-serif text-lg font-bold", done ? "bg-sage text-paper" : "bg-paper-light")}
      >
        {done ? <Check size={18} /> : n}
      </span>
      <div className="pb-8 border-b border-ink/15">
        <h2 className="font-serif text-xl font-bold">
          {title} {done ? <span className="sr-only">(done)</span> : null}
        </h2>
        <div className="mt-2 text-sm text-ink/80 space-y-2">{children}</div>
      </div>
    </li>
  );
}

export function GuideView({ downloadUrl }: { downloadUrl: string | null }) {
  const shop = useShopProfile();
  const $api = useApi();
  const ops = $api.useQuery("get", "/saas/ops/summary", {}, { refetchInterval: 20_000 });
  const gate = ops.data?.data?.liveGate;
  const hasPrices = $api.useQuery("get", "/saas/pricing").data?.data?.configs?.length;

  return (
    <div className="max-w-3xl">
      <PageHeader kicker="Setup" title="Get your shop printing" description="About 20 minutes, once. Each step ticks itself off when we see it working." />
      <ol className="space-y-8 mt-6">
        <Step n={1} title="Set your prices" done={Boolean(hasPrices)}>
          <p>Add at least black &amp; white A4. Students see the exact price before they pay.</p>
          <Link href="/catalogue" className="pl-link font-semibold">
            Open prices →
          </Link>
        </Step>
        <Step n={2} title="Install the kiosk app on your print computer" done={Boolean(gate?.kioskOnline)}>
          <p>Use the Windows or Linux computer that is already connected to your printer by USB or the shop network. It needs internet but no open ports.</p>
          {downloadUrl ? (
            <a href={downloadUrl} className="pl-btn-primary pl-btn-sm inline-flex items-center gap-1.5">
              <Download size={14} /> Download PrintLoop Kiosk
            </a>
          ) : (
            <Notice tone="info">Ask PrintLoop support for the PrintLoop Kiosk installer for your computer.</Notice>
          )}
        </Step>
        <Step n={3} title="Connect it with a kiosk key" done={Boolean(gate?.kioskOnline)}>
          <p>
            In <Link href="/kiosks" className="pl-link font-semibold">Kiosks</Link>, add a kiosk and copy its key. In the kiosk app, open Settings, paste the key and pick your printer. It shows as online here within 10 seconds.
          </p>
          <p className="text-fog">The kiosk checks for new jobs every 10 seconds, so nothing on your network has to accept incoming connections.</p>
        </Step>
        <Step n={4} title="Run a test print" done={Boolean(gate?.testPrintDone)}>
          <p>Open the kiosk in Kiosks and press Test print. When the page comes out, confirm it. This proves paper, toner and drivers are fine.</p>
        </Step>
        <Step n={5} title="Pin your shop and add a payout account" done={Boolean(gate?.locationSet) && (shop.onboarding.bankAccountSet || shop.onboarding.subaccountSet)}>
          <p>
            Add your <Link href="/settings?tab=location" className="pl-link font-semibold">address</Link> so students can find you, and a{" "}
            <Link href="/settings?tab=payouts" className="pl-link font-semibold">bank account</Link> so we can pay you.
          </p>
        </Step>
        <Step n={6} title="Go live" done={Boolean(gate?.isDiscoverable)}>
          <p>
            Turn on your public listing in <Link href="/settings?tab=location" className="pl-link font-semibold">Shop &amp; location</Link>. Then share your print link or print the QR code for your counter.
          </p>
        </Step>
      </ol>
      <Card className="mt-8">
        <h2 className="font-serif text-lg font-bold">Day to day</h2>
        <ul className="mt-2 text-sm space-y-1.5 list-disc pl-5">
          <li>Students pay online and get a 6-digit code. They type it at your counter or kiosk and the job prints.</li>
          <li>
            Watch the <Link href="/queue" className="pl-link font-semibold">Job queue</Link> for anything stuck, and mark yourself Busy or Closed from the top bar.
          </li>
          <li>Paper jam mid-job? The kiosk reports it and the job can be requeued without charging the student again.</li>
        </ul>
      </Card>
    </div>
  );
}
