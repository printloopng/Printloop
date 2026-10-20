"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Crosshair, List, Map as MapIcon, Search, Star } from "lucide-react";
import { EmptyState, ErrorState, Pill, Segmented, Skeleton, cx } from "@printloop/ui";
import { errorMessage, type Schemas } from "@printloop/api-client";
import { useApi } from "@printloop/api-client/react";
import { useShop } from "@/lib/shop-context";

export type Shop = Schemas["ShopSummary"];

const ShopMap = dynamic(() => import("./ShopMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-[28rem] w-full" />,
});

type Geo = { kind: "idle" } | { kind: "asking" } | { kind: "ok"; lat: number; lng: number } | { kind: "denied" };

const AVAILABILITY: Record<string, { label: string; tone: "sage" | "ochre" | "persimmon" }> = {
  open: { label: "Open", tone: "sage" },
  busy: { label: "Busy", tone: "ochre" },
  closed: { label: "Closed", tone: "persimmon" },
};

export function ShopCard({ shop, current }: { shop: Shop; current: boolean }) {
  const avail = AVAILABILITY[shop.availability] ?? AVAILABILITY.open!;
  return (
    <li className={cx("border-2 bg-paper-light flex flex-col", current ? "border-persimmon" : "border-ink")}>
      <div className="h-1.5" style={{ background: shop.brand.primaryColor || "#1A1410" }} />
      {shop.photos[0] ? (
        <img src={shop.photos[0]} alt="" className="h-32 w-full object-cover border-b-2 border-ink" loading="lazy" />
      ) : null}
      <div className="p-4 flex-1 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-serif text-xl font-bold leading-tight">{shop.brand.wordmark || shop.name}</h3>
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
              <Star size={12} fill="currentColor" /> {shop.ratingAverage.toFixed(1)}
              <span className="text-fog font-normal">({shop.ratingCount})</span>
            </span>
          ) : (
            <span className="text-fog">No reviews yet</span>
          )}
          {shop.queueLength > 0 ? <span>Queue {shop.queueLength} · ~{shop.estimatedWaitMin} min</span> : <span>No queue</span>}
        </div>
        <div className="mt-auto pt-3 flex gap-2">
          <Link href={`/shops/${shop.slug}`} className="pl-btn-ghost pl-btn-sm flex-1">
            Prices &amp; reviews
          </Link>
          {current ? (
            <span className="pl-btn-dark pl-btn-sm flex-1 pointer-events-none">Selected</span>
          ) : (
            <a href={`/?shop=${encodeURIComponent(shop.slug)}`} className="pl-btn-primary pl-btn-sm flex-1">
              Print here
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

export function ShopFinder() {
  const $api = useApi();
  const current = useShop();
  const [geo, setGeo] = useState<Geo>({ kind: "idle" });
  const [query, setQuery] = useState("");
  const [onlineOnly, setOnlineOnly] = useState(false);
  const [colourOnly, setColourOnly] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");

  const locate = () => {
    if (!navigator.geolocation) return setGeo({ kind: "denied" });
    setGeo({ kind: "asking" });
    navigator.geolocation.getCurrentPosition(
      (p) => setGeo({ kind: "ok", lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setGeo({ kind: "denied" }),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    );
  };

  const near = geo.kind === "ok";
  const nearby = $api.useQuery(
    "get",
    "/discovery/shops/nearby",
    { params: { query: { lat: near ? geo.lat : 0, lng: near ? geo.lng : 0, radiusKm: 25, limit: 50 } } },
    { enabled: near },
  );
  const all = $api.useQuery("get", "/discovery/shops", {}, { enabled: !near });
  const source = near ? nearby : all;
  const shops = useMemo(() => (source.data?.data?.shops ?? []) as Shop[], [source.data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return shops.filter((s) => {
      if (onlineOnly && !s.agentOnline) return false;
      if (colourOnly && !s.hasColor) return false;
      if (!q) return true;
      return `${s.name} ${s.brand.wordmark ?? ""} ${s.address ?? ""}`.toLowerCase().includes(q);
    });
  }, [shops, query, onlineOnly, colourOnly]);

  return (
    <div>
      <div className="flex flex-col md:flex-row gap-3 md:items-center mb-5">
        <label className="relative flex-1">
          <span className="sr-only">Search shops</span>
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fog" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or area"
            className="pl-input pl-9"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setOnlineOnly((v) => !v)} className={cx("pl-chip", onlineOnly && "pl-chip-active")}>
            Online now
          </button>
          <button type="button" onClick={() => setColourOnly((v) => !v)} className={cx("pl-chip", colourOnly && "pl-chip-active")}>
            Colour
          </button>
          <button
            type="button"
            onClick={locate}
            className={cx("pl-chip", near && "pl-chip-active")}
            disabled={geo.kind === "asking"}
          >
            <Crosshair size={13} /> {geo.kind === "asking" ? "Locating…" : near ? "Near me" : "Use my location"}
          </button>
          <Segmented
            label="View"
            value={view}
            onChange={setView}
            items={[
              { value: "list", label: "List" },
              { value: "map", label: "Map" },
            ]}
          />
        </div>
      </div>
      {geo.kind === "denied" ? (
        <p className="text-xs text-fog mb-4">Location is off, so shops are sorted by name. Turn it on in your browser to sort by distance.</p>
      ) : null}

      {source.error ? (
        <ErrorState message={errorMessage(source.error)} />
      ) : source.isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      ) : view === "map" ? (
        <ShopMap shops={filtered} center={near ? [geo.lat, geo.lng] : null} currentSlug={current?.slug ?? null} />
      ) : filtered.length ? (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <ShopCard key={s.slug} shop={s} current={current?.slug === s.slug} />
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={view === "list" ? <List size={28} /> : <MapIcon size={28} />}
          title="No shops match"
          description="Try clearing the filters or searching a different area."
        />
      )}
    </div>
  );
}
