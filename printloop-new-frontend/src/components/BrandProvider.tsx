import { useEffect, useState, createContext } from "react";
import { CONFIG } from "@/constants/config";
import { setSentryTenant } from "@/lib/sentry";

interface BrandData {
  tenant: { id: string; name: string; slug: string } | null;
  branding: {
    wordmark: string | null;
    tagline: string | null;
    logoUrl: string | null;
    faviconUrl: string | null;
    primaryColor: string | null;
    secondaryColor: string | null;
    accentColor: string | null;
  } | null;
}

const BrandContext = createContext<BrandData>({ tenant: null, branding: null });

export default function BrandProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [brand, setBrand] = useState<BrandData>({
    tenant: null,
    branding: null,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${CONFIG.apiBaseUrl}/branding`);
        if (!res.ok) return;
        const json = await res.json();
        const data: BrandData = json?.data ?? { tenant: null, branding: null };
        if (cancelled) return;
        setBrand(data);
        applyBrand(data);
        setSentryTenant(data.tenant?.slug ?? null);
      } catch {
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>
  );
}

function applyBrand(data: BrandData): void {
  const b = data.branding;
  if (!b) return;
  const root = document.documentElement;
  if (b.primaryColor) root.style.setProperty("--pl-brand-primary", b.primaryColor);
  if (b.secondaryColor)
    root.style.setProperty("--pl-brand-secondary", b.secondaryColor);
  if (b.accentColor) root.style.setProperty("--pl-brand-accent", b.accentColor);

  const title = b.wordmark || data.tenant?.name;
  if (title) document.title = title;

  if (b.faviconUrl) {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = b.faviconUrl;
  }
}
