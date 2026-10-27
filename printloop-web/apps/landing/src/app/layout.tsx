import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { SITE } from "@/lib/site";
import { fontVariables } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.baseUrl),
  title: { default: `${SITE.name} · ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
  openGraph: { type: "website", siteName: SITE.name, locale: "en_NG", title: `${SITE.name} · ${SITE.tagline}`, description: SITE.description },
  twitter: { card: "summary_large_image", title: `${SITE.name} · ${SITE.tagline}`, description: SITE.description },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#F8F4ED", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-NG" className={fontVariables}>
      <body className="min-h-screen bg-paper text-ink">{children}</body>
    </html>
  );
}
