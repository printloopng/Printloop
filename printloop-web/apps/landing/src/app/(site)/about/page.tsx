import type { Metadata } from "next";
import Link from "next/link";
import { Counter, Reveal } from "@printloop/ui";
import { Accent, Bullets, PageHero } from "@/components/PageHero";
import { LIMITS } from "@/lib/site";

export const metadata: Metadata = {
  title: "About",
  description: "PrintLoop started with a simple observation: students spend hours queuing at print labs for a ten-minute job. The fix is a better loop, not a faster printer.",
};

const PERSPECTIVES = [
  {
    n: "01",
    who: "FOR STUDENTS",
    title: "Print from class, collect when you're free.",
    copy: "Upload from your phone between lectures and pay with your bank or card. Walk past the shop whenever it suits you and type in your code.",
    items: ["No queues at the lab", `Codes valid for ${LIMITS.codeHours} hours`, "Private files, released only by you"],
  },
  {
    n: "02",
    who: "FOR COURSE REPS",
    title: "Collect the whole class with one link.",
    copy: "One group link, every submission, one release code at the kiosk. Deadlines, per-person settings and payments are handled for you.",
    items: ["Guests can join without an account", "Everyone pays for their own pages", "One code prints the whole batch"],
  },
  {
    n: "03",
    who: "FOR PRINT SHOPS",
    title: "Turn walk-ins into online orders.",
    copy: "List your shop, publish your prices and take orders from customers who are at your door or ten kilometres away.",
    items: ["Discovery on the public shop map", "Kiosk app with driverless printer support", "Payouts with Paystack split"],
  },
  {
    n: "04",
    who: "FOR THE PLATFORM",
    title: "Every print, recorded. Every shop, in control.",
    copy: "Multi-shop from day one: separate prices, teams, branding and payouts for each shop, with an audit trail on every sensitive action.",
    items: ["Each shop's data stays its own", "Optional custom domain and webhooks", "Two-step sign-in for owners and staff"],
  },
];

const FACTS = [
  { value: 5, suffix: " min", label: "typical phone to paper" },
  { value: LIMITS.batchDocuments, suffix: "", label: "documents per batch" },
  { value: LIMITS.codeHours, suffix: " hrs", label: "code validity" },
  { value: 0, suffix: "", label: "cash at the counter" },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        kicker="ABOUT PRINTLOOP"
        title={
          <>
            Campus printing, rebuilt like a <Accent>public service.</Accent>
          </>
        }
        lede="PrintLoop started with a simple observation: Nigerian students spend hours of their week queuing at print labs for a ten-minute job. The fix isn't a faster printer, it's a better loop. Upload anywhere. Pay once. Collect by code."
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
          {FACTS.map((s) => (
            <Reveal key={s.label} variant="rise">
              <div className="border-4 border-ink bg-paper-light p-5 text-center">
                <div className="pl-mono text-4xl sm:text-5xl font-bold leading-none mb-2">
                  <Counter to={s.value} />
                  <span className="text-persimmon">{s.suffix}</span>
                </div>
                <div className="editorial-label text-ink/55">{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </PageHero>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
        {PERSPECTIVES.map((p) => (
          <Reveal key={p.n} variant="rise">
            <div className="border-t-2 border-ink py-10 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
              <div>
                <div className="pl-mono text-4xl font-bold text-ink/15">{p.n}</div>
                <div className="editorial-label text-persimmon mt-2">{p.who}</div>
              </div>
              <div>
                <h2 className="pl-serif text-2xl sm:text-3xl font-bold tracking-tight mb-3">{p.title}</h2>
                <p className="pl-serif italic text-ink/65 text-sm sm:text-base leading-relaxed mb-4">{p.copy}</p>
                <Bullets items={p.items} />
              </div>
            </div>
          </Reveal>
        ))}
        <div className="border-t-2 border-ink" />
      </section>

      <section className="bg-ink text-paper">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 text-center">
          <Reveal variant="rise">
            <h2 className="pl-serif text-2xl sm:text-4xl font-bold tracking-tight mb-3">
              Read how it works, <em className="italic text-persimmon">in full.</em>
            </h2>
            <p className="pl-serif italic text-paper/60 text-sm sm:text-base mb-6">Guides, updates and the occasional rant about lab printers.</p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Link href="/blog" className="pl-btn-primary px-6 py-3 text-sm">
                VISIT THE BLOG →
              </Link>
              <Link href="/contact" className="pl-btn-light px-6 py-3 text-sm">
                CONTACT US
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
