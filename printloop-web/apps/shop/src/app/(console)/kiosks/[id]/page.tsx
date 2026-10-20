import type { Metadata } from "next";
import { KioskDetail } from "./KioskDetail";

export const metadata: Metadata = { title: "Kiosk" };

export default async function KioskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <KioskDetail id={id} />;
}
