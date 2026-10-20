import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { publicApiOrigin } from "@printloop/auth/config";
import { fontVariables } from "@/lib/fonts";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Shop console · PrintLoop", template: "%s · Shop console" },
  description: "Run your print shop on PrintLoop: queue, kiosks, pricing, payouts.",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = { themeColor: "#1A1410", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-NG" className={fontVariables}>
      <body className="min-h-screen bg-paper text-ink">
        <Providers apiOrigin={publicApiOrigin()}>{children}</Providers>
      </body>
    </html>
  );
}
