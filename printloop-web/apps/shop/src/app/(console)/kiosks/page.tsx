import type { Metadata } from "next";
import { KiosksView } from "./KiosksView";

export const metadata: Metadata = { title: "Kiosks" };

export default function KiosksPage() {
  return <KiosksView />;
}
