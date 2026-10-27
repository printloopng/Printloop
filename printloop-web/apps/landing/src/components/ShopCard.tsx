import Link from "next/link";
import { Star } from "lucide-react";
import { Pill } from "@printloop/ui";
import type { ShopSummary } from "@/lib/api";
import { LINKS } from "@/lib/site";

const AVAILABILITY = {
  open: { label: "Open", tone: "sage" },
  busy: { label: "Busy", tone: "ochre" },
  closed: { label: "Closed", tone: "persimmon" },
} as const;

export function ShopCard({ shop }: { shop: ShopSummary }) {
  const avail = AVAILABILITY[shop.availability] ?? AVAILABILITY.open;
  const name = shop.brand.wordmark || shop.name;
  return (
    <li className="border-2 border-ink bg-paper-light flex flex-col">
      <div className="h-1.5" style={{ background: shop.brand.primaryColor || "#1A1410" }} />
      {shop.photos[0] ? <img src={shop.photos[0]} alt="" className="h-32 w-full object-cover border-b-2 border-ink" loading="lazy" /> : null}
      <div className="p-4 flex-1 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-serif text-xl font-bold leading-tight">{name}</h2>
          <Pill tone={avail.tone} live={shop.agentOnline && shop.availability === "open"}>
            {shop.agentOnline ? avail.label : "Offline"}
          </Pill>
        </div>
        {shop.address ? <p className="text-xs text-fog">{shop.address}</p> : null}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {shop.distanceKm != null ? <span className="font-bold">{shop.distanceKm.toFixed(1)} km</span> : null}
          {shop.cheapestPerPage != null ? <span>from ₦{shop.cheapestPerPage}/page</span> : null}
          <span>{shop.hasColor ? "B&W + colour" : "B&W only"}</span>
          <span>{shop.paperSizes.join(" · ")}</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-ink/70">
          {shop.ratingCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-ochre font-bold">
              <Star size={12} fill="currentColor" aria-hidden /> {shop.ratingAverage.toFixed(1)}
              <span className="text-fog font-normal">({shop.ratingCount})</span>
            </span>
          ) : (
            <span className="text-fog">No reviews yet</span>
          )}
          {shop.queueLength > 0 ? <span>Queue {shop.queueLength} · ~{shop.estimatedWaitMin} min</span> : <span>No queue</span>}
        </div>
        <div className="mt-auto pt-3 flex gap-2">
          <Link href={`/find/${shop.slug}`} className="pl-btn-ghost pl-btn-sm flex-1">
            Prices &amp; reviews
          </Link>
          <a href={LINKS.printAt(shop.slug)} className="pl-btn-primary pl-btn-sm flex-1">
            Print here
          </a>
        </div>
      </div>
    </li>
  );
}
