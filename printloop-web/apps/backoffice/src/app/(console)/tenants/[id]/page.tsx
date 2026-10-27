import type { Metadata } from "next";
import { TenantDetail } from "./TenantDetail";

export const metadata: Metadata = { title: "Shop" };

export default async function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TenantDetail id={id} />;
}
