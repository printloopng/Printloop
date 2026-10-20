import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import { Pill, Section, buttonClass, formatDate, formatNaira } from "@printloop/ui";
import { isApiError, type Schemas } from "@printloop/api-client";
import { getCurrentUser, serverApi } from "@printloop/auth/server";
import { PublicShell } from "@/components/PublicShell";

type Detail = Schemas["ShopDetail"];

async function loadShop(slug: string): Promise<Detail | null> {
  try {
    const api = await serverApi({ auth: false });
    const { data } = await api.GET("/discovery/shops/{slug}", { params: { path: { slug } } });
    return (data?.data as Detail) ?? null;
  } catch (err) {
    if (isApiError(err) && err.status === 404) return null;
    throw err;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const detail = await loadShop((await params).slug);
  return { title: detail ? detail.shop.brand.wordmark || detail.shop.name : "Shop not found" };
}

function price(v: number | null | undefined) {
  return v == null ? "—" : formatNaira(v);
}

export default async function ShopDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [detail, user] = await Promise.all([loadShop(slug), getCurrentUser()]);
  if (!detail) notFound();
  const { shop, pricing, reviews } = detail;
  const name = shop.brand.wordmark || shop.name;

  return (
    <PublicShell signedIn={Boolean(user)}>
      <div className="h-2 mb-6" style={{ background: shop.brand.primaryColor || "#1A1410" }} />
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-5 border-b-2 border-ink pb-6 mb-8">
        <div>
          <Link href="/shops" className="editorial-label text-ink/50 hover:text-persimmon">
            ← All shops
          </Link>
          <h1 className="mt-3 font-serif text-4xl sm:text-5xl font-extrabold tracking-tight">{name}</h1>
          {shop.address ? <p className="mt-2 text-ink/60">{shop.address}</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <Pill tone={shop.agentOnline ? "sage" : "fog"} live={shop.agentOnline}>
              {shop.agentOnline ? shop.availability : "Offline"}
            </Pill>
            {shop.ratingCount > 0 ? (
              <span className="inline-flex items-center gap-1 text-ochre font-bold">
                <Star size={14} fill="currentColor" /> {shop.ratingAverage.toFixed(1)}
                <span className="text-fog font-normal">· {shop.ratingCount} review{shop.ratingCount === 1 ? "" : "s"}</span>
              </span>
            ) : null}
            <span className="text-fog">
              {shop.queueLength > 0 ? `${shop.queueLength} in queue · ~${shop.estimatedWaitMin} min` : "No queue right now"}
            </span>
          </div>
        </div>
        <a href={`/print/new?shop=${encodeURIComponent(shop.slug)}`} className={buttonClass("primary", "lg")}>
          Print here <span className="pl-arrow">→</span>
        </a>
      </header>

      {shop.photos.length ? (
        <div className="flex gap-3 overflow-x-auto pb-2 mb-8 snap-x">
          {shop.photos.map((url, i) => (
            <img key={url} src={url} alt={`${name} photo ${i + 1}`} className="h-44 w-72 object-cover border-2 border-ink shrink-0 snap-start" />
          ))}
        </div>
      ) : null}

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-8">
        <Section title="Prices per page" description="Single-sided and double-sided, by print quality.">
          {pricing.length ? (
            <div className="border-2 border-ink overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-ink text-paper">
                  <tr>
                    <th scope="col" className="pl-table-head">Paper</th>
                    <th scope="col" className="pl-table-head">Draft 100</th>
                    <th scope="col" className="pl-table-head">Standard 300</th>
                    <th scope="col" className="pl-table-head">Sharp 600</th>
                  </tr>
                </thead>
                <tbody>
                  {pricing.map((row) => (
                    <tr key={`${row.paperSize}-${row.colorType}`} className="border-t-2 border-ink/15">
                      <th scope="row" className="px-4 py-3 text-left font-bold">
                        {row.paperSize} · {row.colorType === "COLOR" ? "Colour" : "B&W"}
                      </th>
                      {([["price100Simplex", "price100Duplex"], ["price300Simplex", "price300Duplex"], ["price600Simplex", "price600Duplex"]] as const).map(
                        ([simplex, duplex]) => (
                          <td key={simplex} className="px-4 py-3 pl-mono tabular-nums">
                            {price(row[simplex])}
                            <span className="block text-[11px] text-fog">duplex {price(row[duplex])}</span>
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-fog">This shop hasn&apos;t published prices yet.</p>
          )}
        </Section>

        <Section title="Reviews">
          {reviews.length ? (
            <ul className="space-y-3">
              {reviews.map((r) => (
                <li key={r.id} className="border-2 border-ink bg-paper-light p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm">
                      {r.user.firstName} {r.user.lastName}
                    </span>
                    <span className="text-xs text-fog">{formatDate(r.createdAt)}</span>
                  </div>
                  <div className="text-ochre text-sm mt-1" aria-label={`${r.rating} out of 5`}>
                    {"★".repeat(r.rating)}
                    <span className="text-ink/20">{"★".repeat(5 - r.rating)}</span>
                  </div>
                  {r.comment ? <p className="mt-2 text-sm text-ink/80">{r.comment}</p> : null}
                  {r.photoUrl ? <img src={r.photoUrl} alt="" className="mt-3 h-28 border border-ink/20 object-cover" /> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fog">No reviews yet. Print here and be the first.</p>
          )}
        </Section>
      </div>
    </PublicShell>
  );
}
