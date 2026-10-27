import type { Metadata } from "next";
import { Reveal } from "@printloop/ui";
import { Accent, PageHero } from "@/components/PageHero";
import { LIMITS, LINKS } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pricing",
  description: "Per-page prices set by each shop and shown before you pay. Group printing is free to start. Shops pay a platform fee only when they earn.",
};

const TIERS = [
  {
    name: "Students & everyone",
    tag: "per-page prices",
    price: "₦5",
    unit: "lowest per page",
    note: "Each shop sets its own prices. See a shop's full list on its page.",
    items: ["Black & white and colour", "A4, A3 and more, depending on the shop", "Draft, standard and sharp quality tiers", "Single and double-sided prices, clearly published", "Office documents and images converted free"],
    cta: "FIND A SHOP",
    href: "/find",
    external: false,
  },
  {
    name: "Course reps & clubs",
    tag: "recommended",
    price: "₦0",
    unit: "to start a group",
    note: "Everyone pays for their own pages, so there is nothing extra to chip in.",
    items: ["Group sessions with deadlines", "One shareable link for the whole class", "Guests can join without an account", "One release code for the whole batch", `Batches of up to ${LIMITS.batchDocuments} documents`],
    cta: "START A GROUP",
    href: LINKS.groups,
    external: true,
  },
  {
    name: "Print shops",
    tag: "platform fee",
    price: `${LIMITS.platformFeePct}%`,
    unit: "only when you earn",
    note: "Taken automatically by Paystack split when a customer pays, so there is nothing to invoice.",
    items: ["Public shop page and price list", "Kiosk app with driverless printer support", "Dashboard, reports and team roles", "Scheduled payouts to your bank", "Your own branding and custom domain"],
    cta: "OPEN YOUR SHOP",
    href: LINKS.openShop,
    external: true,
  },
];

export default function PricingPage() {
  return (
    <PageHero
      kicker="PRICING"
      title={
        <>
          Honest per-page prices, <Accent>published before you pay.</Accent>
        </>
      }
      lede="No hidden markups. A shop's prices are public, checkout shows the exact number, and Office documents are priced on their real, converted page count."
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-10">
        {TIERS.map((t, i) => {
          const dark = i === 1;
          const cta = `text-center font-bold text-xs tracking-editorial py-3 border-2 ${dark ? "bg-persimmon text-paper border-persimmon hover:bg-paper hover:text-ink hover:border-paper" : "bg-ink text-paper border-ink hover:bg-persimmon hover:border-persimmon"}`;
          return (
            <Reveal key={t.name} variant="rise" className="h-full">
              <div className={`border-4 border-ink p-6 flex flex-col h-full ${dark ? "bg-ink text-paper" : "bg-paper-light"}`}>
                <div className="flex items-center justify-between mb-4">
                  <span className="editorial-label text-persimmon">{t.tag}</span>
                  <span className={`pl-mono text-[10px] ${dark ? "text-paper/50" : "text-ink/40"}`}>{String(i + 1).padStart(2, "0")}</span>
                </div>
                <h2 className="pl-serif text-xl font-bold mb-1">{t.name}</h2>
                <div className="mb-1">
                  <span className="pl-mono text-4xl font-bold">{t.price}</span>
                  <span className={`text-xs ml-1 ${dark ? "text-paper/60" : "text-ink/55"}`}>{t.unit}</span>
                </div>
                <p className={`pl-serif italic text-xs mb-4 ${dark ? "text-paper/60" : "text-ink/55"}`}>{t.note}</p>
                <ul className="space-y-2 text-sm flex-1 mb-6">
                  {t.items.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <span aria-hidden className="text-persimmon font-bold mt-px">
                        ▸
                      </span>
                      <span className={dark ? "text-paper/85" : ""}>{item}</span>
                    </li>
                  ))}
                </ul>
                <a href={t.href} className={cta}>
                  {t.cta} →
                </a>
              </div>
            </Reveal>
          );
        })}
      </div>
      <div className="border-2 border-ochre/60 bg-ochre/10 p-5 mt-8 text-sm pl-serif">
        <span className="font-bold">Fine print:</span> payment processing fees from Paystack may apply on top of the per-page price. Office documents are priced on the confirmed converted page count. Shops set their own prices, and the ₦5 shown is the lowest a shop can charge per page.
      </div>
    </PageHero>
  );
}
