import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@printloop/ui";
import { Accent, PageHero } from "@/components/PageHero";
import { NearMeButton } from "@/components/NearMeButton";
import { ShopCard } from "@/components/ShopCard";
import { publicGet, type ShopSummary } from "@/lib/api";

export const metadata: Metadata = {
  title: "Find a print shop",
  description: "Browse PrintLoop print shops near your campus, compare prices and queue times, and start a print.",
};

type Params = { q?: string; lat?: string; lng?: string };

async function loadShops({ q, lat, lng }: Params): Promise<{ shops: ShopSummary[]; failed: boolean; near: boolean }> {
  const latN = Number(lat);
  const lngN = Number(lng);
  const near = lat != null && lng != null && Number.isFinite(latN) && Number.isFinite(lngN) && Math.abs(latN) <= 90 && Math.abs(lngN) <= 180;
  try {
    if (near) {
      const data = await publicGet<{ shops: ShopSummary[] }>(`/discovery/shops/nearby?lat=${latN}&lng=${lngN}&radiusKm=25&limit=50`, { revalidate: 30 });
      return { shops: data.shops, failed: false, near: true };
    }
    const query = q?.trim() ? `?q=${encodeURIComponent(q.trim().slice(0, 80))}` : "";
    const data = await publicGet<{ shops: ShopSummary[] }>(`/discovery/shops${query}`, { revalidate: 60 });
    return { shops: data.shops, failed: false, near: false };
  } catch {
    return { shops: [], failed: true, near: false };
  }
}

export default async function FindPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const { shops, failed, near } = await loadShops(params);
  const q = params.q?.trim() ?? "";

  return (
    <PageHero
      kicker="FIND A SHOP"
      title={
        <>
          Print at a shop <Accent>near you.</Accent>
        </>
      }
      lede="Compare prices, queue times and ratings, then upload your file and collect it when it suits you."
    >
      <div className="mt-8 flex flex-col md:flex-row gap-3 md:items-start mb-6">
        <form action="/find" method="get" role="search" className="flex flex-1 gap-2">
          <label className="flex-1">
            <span className="sr-only">Search shops by name or area</span>
            <input name="q" defaultValue={q} placeholder="Search by name or area" className="pl-input" />
          </label>
          <button type="submit" className="pl-btn-dark pl-btn-sm">
            Search
          </button>
        </form>
        <NearMeButton active={near} />
      </div>

      {failed ? (
        <EmptyState title="We couldn't load shops" description="Please try again in a moment." />
      ) : shops.length ? (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shops.map((s) => (
            <ShopCard key={s.slug} shop={s} />
          ))}
        </ul>
      ) : (
        <EmptyState
          title="No shops match"
          description={near ? "No shops within 25 km yet. Try searching by name." : q ? `Nothing for "${q}". Try another name or area.` : "No shops are listed yet."}
          action={
            q || near ? (
              <Link href="/find" className="pl-btn-ghost">
                Clear search
              </Link>
            ) : null
          }
        />
      )}
    </PageHero>
  );
}
