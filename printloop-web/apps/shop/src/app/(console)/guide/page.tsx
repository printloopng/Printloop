import type { Metadata } from "next";
import { GuideView } from "./GuideView";

export const metadata: Metadata = { title: "Setup guide" };

export default function GuidePage() {
  return <GuideView downloadUrl={process.env.NEXT_PUBLIC_KIOSK_DOWNLOAD_URL || null} />;
}
