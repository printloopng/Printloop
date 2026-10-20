import type { Metadata } from "next";
import { getCurrentUser } from "@printloop/auth/server";
import { PublicShell } from "@/components/PublicShell";
import { ShopFinder } from "./ShopFinder";

export const metadata: Metadata = { title: "Find a print shop" };

export default async function ShopsPage() {
  const user = await getCurrentUser();
  return (
    <PublicShell signedIn={Boolean(user)}>
      <header className="mb-6 border-b-2 border-ink pb-5">
        <div className="editorial-label text-persimmon">Print shops</div>
        <h1 className="mt-2 font-serif text-4xl font-extrabold tracking-tight">Find a shop near you.</h1>
        <p className="mt-2 font-serif italic text-ink/60">Compare prices, check what&apos;s online and see the queue before you walk over.</p>
      </header>
      <ShopFinder />
    </PublicShell>
  );
}
