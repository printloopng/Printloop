import type { Metadata } from "next";
import { Reveal } from "@printloop/ui";
import { Accent, PageHero } from "@/components/PageHero";
import { LINKS, SITE } from "@/lib/site";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact",
  description: "Questions, lost codes or shop partnerships. We reply within one business day.",
};

export default function ContactPage() {
  const channels = [
    { k: "EMAIL", v: SITE.supportEmail, href: `mailto:${SITE.supportEmail}` },
    ...(SITE.supportWhatsapp ? [{ k: "WHATSAPP", v: SITE.supportWhatsapp, href: `https://wa.me/${SITE.supportWhatsapp.replace(/\D/g, "")}` }] : []),
    { k: "PRINT SHOPS", v: "Open your shop", href: LINKS.openShop },
  ];
  return (
    <PageHero
      kicker="CONTACT"
      title={
        <>
          Talk to a <Accent>human.</Accent>
        </>
      }
      lede="Questions, lost codes, shop partnerships. We reply within one business day."
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-10">
        <Reveal variant="rise">
          <ContactForm email={SITE.supportEmail} />
        </Reveal>
        <Reveal variant="rise">
          <div className="space-y-4">
            {channels.map((c) => (
              <a key={c.k} href={c.href} className="block border-4 border-ink bg-paper p-5 transition-all hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#1A1410]">
                <div className="editorial-label text-persimmon mb-1">{c.k}</div>
                <div className="font-bold text-lg pl-serif">{c.v}</div>
              </a>
            ))}
            <div className="border-4 border-ink bg-ink text-paper p-5">
              <div className="editorial-label text-persimmon mb-1">HOURS</div>
              <div className="pl-mono text-sm text-paper/80">MON–SAT · 08:00–20:00 WAT</div>
              <div className="text-[11px] text-paper/50 mt-2">Shops keep their own opening hours. Each shop page shows whether it is open now.</div>
            </div>
          </div>
        </Reveal>
      </div>
    </PageHero>
  );
}
