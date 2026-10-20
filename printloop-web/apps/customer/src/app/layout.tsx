import type { Metadata, Viewport } from "next";
import type { CSSProperties, ReactNode } from "react";
import { publicApiOrigin } from "@printloop/auth/config";
import { fontVariables } from "@/lib/fonts";
import { brandRgb, getShop } from "@/lib/shop";
import { Providers } from "./providers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const shop = await getShop();
  const name = shop ? `${shop.name} · PrintLoop` : "PrintLoop";
  return {
    title: { default: name, template: `%s · ${name}` },
    description: "Upload, pay and print from any PrintLoop station on campus.",
    robots: { index: false, follow: false },
    icons: shop?.branding?.faviconUrl ? { icon: shop.branding.faviconUrl } : { icon: "/icon.svg" },
    applicationName: "PrintLoop",
  };
}

export const viewport: Viewport = {
  themeColor: "#F8F4ED",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const shop = await getShop();
  const rgb = brandRgb(shop?.branding?.primaryColor);
  const style = rgb ? ({ "--pl-brand-rgb": rgb } as CSSProperties) : undefined;
  return (
    <html lang="en-NG" className={fontVariables} style={style}>
      <body className="min-h-screen bg-paper text-ink">
        <Providers
          apiOrigin={publicApiOrigin()}
          shop={
            shop
              ? {
                  id: shop.id,
                  slug: shop.slug,
                  name: shop.name,
                  fromHost: shop.fromHost,
                  logoUrl: shop.branding?.logoUrl ?? null,
                  primaryColor: shop.branding?.primaryColor ?? null,
                  tagline: shop.branding?.tagline ?? null,
                }
              : null
          }
        >
          {children}
        </Providers>
      </body>
    </html>
  );
}
