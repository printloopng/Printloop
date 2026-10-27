import type { Metadata } from "next";
import Link from "next/link";
import { Counter, Reveal } from "@printloop/ui";
import { Accent, Bullets, PageHero } from "@/components/PageHero";
import { LIMITS, LINKS } from "@/lib/site";

export const metadata: Metadata = {
  title: "Features",
  description: "Phone upload, public pricing, six-character release codes, group printing, Edit & Print and a full dashboard for print shops.",
};

const FEATURES = [
  {
    n: "01",
    label: "UPLOAD FROM ANYWHERE",
    title: "Your phone is the print queue.",
    copy: "PDF, Word, PowerPoint, Excel or an image: upload from a browser tab on your phone. No app to install, no USB stick, no lab computer.",
    bullets: ["PDF, DOCX, PPTX, XLSX, JPG and PNG", "Pages counted for you, Office files converted", "Print only the pages you need"],
    stat: { value: LIMITS.fileMb, suffix: " MB", label: "max size per file" },
  },
  {
    n: "02",
    label: "HONEST, PUBLIC PRICING",
    title: "The price is on the wall before you pay.",
    copy: "Every PrintLoop shop publishes its own prices by paper size, colour, quality and single or double sided. What checkout shows is what you are charged.",
    bullets: ["Per-page prices by paper, colour and quality", "Office files are priced after conversion, so the page count is exact", "Promo codes applied before you pay"],
    stat: { value: 5, suffix: "", prefix: "₦", label: "lowest a shop can charge per page" },
  },
  {
    n: "03",
    label: "ONE CODE, INSTANT COLLECT",
    title: "A short key to your prints.",
    copy: "Pay once and get your release code. Walk into the shop, type the code at the kiosk and your pages start printing.",
    bullets: ["Six-character code and QR on your receipt", `Valid for ${LIMITS.codeHours} hours`, "Your file stays private until you release it"],
    stat: { value: 6, suffix: "", label: "characters to collect" },
  },
  {
    n: "04",
    label: "GROUP & BATCH PRINTING",
    title: "One link, one code, every classmate.",
    copy: "Course reps collect a whole class through one shareable link. Everyone uploads, sets up and pays for their own pages, and you collect the lot with a single code.",
    bullets: ["Group sessions with deadlines", `Batch jobs of up to ${LIMITS.batchDocuments} documents, each with its own settings`, "Guests can join without an account"],
    stat: { value: LIMITS.batchDocuments, suffix: "", label: "documents in one batch" },
  },
  {
    n: "05",
    label: "EDIT & PRINT",
    title: "Let the shop fix it before it prints.",
    copy: "Ask the shop to tidy a document. They edit it live in the browser, you review the result, and nothing is charged or printed until you approve.",
    bullets: ["Shops set their own editing fee", "You see the edited document before paying", "Reject and ask for changes at any time"],
    stat: { value: 0, suffix: "", prefix: "₦", label: "charged until you approve" },
  },
  {
    n: "06",
    label: "FOR PRINT SHOPS",
    title: "A storefront, a queue, a payout.",
    copy: "List your shop, take orders online, run your kiosks and get paid. PrintLoop's share is settled automatically through Paystack split.",
    bullets: ["Public shop page and price list", "Kiosk app that polls for jobs, so no open ports", "Dashboard, reports, team roles and scheduled payouts"],
    stat: { value: LIMITS.platformFeePct, suffix: "%", label: "platform fee, only when you earn" },
  },
];

export default function FeaturesPage() {
  return (
    <>
      <PageHero
        kicker="THE PRINTLOOP PLATFORM"
        title={
          <>
            Everything between <Accent>upload</Accent> and <Accent>paper</Accent>.
          </>
        }
        lede="One platform for students, course reps and print shops. From phone upload to the printer tray, priced honestly, paid securely, released by code."
      />
      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-10">
        {FEATURES.map((f, i) => (
          <div key={f.n} className="border-t-2 border-ink">
            <article className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10 items-center py-10 lg:py-14">
              <div className={i % 2 === 1 ? "lg:order-2" : ""}>
                <Reveal variant="rise">
                  <div className="editorial-label text-persimmon mb-3">
                    § {f.n} · {f.label}
                  </div>
                  <h2 className="pl-serif text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight mb-4">{f.title}</h2>
                  <p className="pl-serif italic text-ink/65 text-sm sm:text-base leading-relaxed mb-5">{f.copy}</p>
                  <Bullets items={f.bullets} className="mb-6" />
                </Reveal>
              </div>
              <div className={i % 2 === 1 ? "lg:order-1" : ""}>
                <Reveal variant="rise">
                  <div className="border-4 border-ink bg-paper-light p-6 sm:p-8 shadow-[6px_6px_0_#1A1410] relative">
                    <div className="absolute -top-3 right-4 bg-persimmon text-paper text-[10px] font-bold tracking-editorial px-2.5 py-1">PRINTLOOP</div>
                    <div className="pl-mono text-6xl sm:text-7xl font-bold leading-none mb-4">
                      <Counter to={f.stat.value} prefix={"prefix" in f.stat ? f.stat.prefix : ""} />
                      <span className="text-persimmon">{f.stat.suffix}</span>
                    </div>
                    <div className="editorial-label text-ink/55">{f.stat.label}</div>
                  </div>
                </Reveal>
              </div>
            </article>
          </div>
        ))}
        <div className="border-t-2 border-ink" />
      </section>

      <section className="bg-ink text-paper">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 text-center">
          <Reveal variant="rise">
            <h2 className="pl-serif text-2xl sm:text-4xl font-bold tracking-tight mb-3">
              Your next print is <em className="italic text-persimmon">one upload away.</em>
            </h2>
            <p className="pl-serif italic text-paper/60 text-sm sm:text-base mb-6">Register free, find a shop near you and print from your phone.</p>
            <div className="flex gap-3 justify-center flex-wrap">
              <a href={LINKS.register} className="pl-btn-primary px-6 py-3 text-sm">
                REGISTER FREE →
              </a>
              <Link href="/find" className="pl-btn-light px-6 py-3 text-sm">
                FIND A SHOP
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
