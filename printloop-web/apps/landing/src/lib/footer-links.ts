import { LINKS } from "./site";

export interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

export const FOOTER_COLUMNS: Array<{ title: string; links: FooterLink[] }> = [
  {
    title: "Students",
    links: [
      { label: "Find a shop", href: "/find" },
      { label: "Register", href: LINKS.register, external: true },
      { label: "Features", href: "/features" },
    ],
  },
  {
    title: "Print shops",
    links: [
      { label: "Open your shop", href: LINKS.openShop, external: true },
      { label: "Shop sign in", href: LINKS.shopLogin, external: true },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Blog", href: "/blog" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy policy", href: "/privacy" },
      { label: "Terms of service", href: "/terms" },
    ],
  },
];
