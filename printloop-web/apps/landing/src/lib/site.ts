import { appUrls } from "@printloop/auth/config";

export const SITE = {
  name: "PrintLoop",
  tagline: "Campus printing, done right.",
  description: "Upload from your phone, pay online, and collect your prints at any PrintLoop shop with a six-character code. Built for Nigerian campuses.",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@printloop.ng",
  supportWhatsapp: process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP || null,
  privacyEmail: "privacy@printloop.ng",
  legalEmail: "legal@printloop.ng",
  baseUrl: appUrls.landing,
};

export const LINKS = {
  signIn: `${appUrls.customer}/login`,
  register: `${appUrls.customer}/register`,
  groups: `${appUrls.customer}/groups`,
  openShop: `${appUrls.shop}/signup`,
  shopLogin: `${appUrls.shop}/login`,
  printAt: (slug: string) => `${appUrls.customer}/print/new?shop=${encodeURIComponent(slug)}`,
};

export const NAV = [
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "Find a shop", href: "/find" },
  { label: "About", href: "/about" },
  { label: "Blog", href: "/blog" },
  { label: "Contact", href: "/contact" },
] as const;

export const LIMITS = {
  fileMb: 50,
  batchDocuments: 20,
  codeHours: 24,
  platformFeePct: 10,
};
