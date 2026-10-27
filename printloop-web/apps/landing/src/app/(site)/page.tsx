import Link from "next/link";
import { Counter, Magnetic, Marquee, Reveal } from "@printloop/ui";
import { HeroTitle } from "@/components/HeroTitle";
import { LIMITS, LINKS } from "@/lib/site";

const STEPS = [
  {
    n: "01",
    t: "Upload from your phone",
    b: `PDFs, Word, PowerPoint, Excel and photos, up to ${LIMITS.fileMb} MB each. We count the pages for you.`,
    foot: "PDF · DOCX · PPTX · XLSX · JPG · PNG",
  },
  {
    n: "02",
    t: "Pay online, get your code",
    b: "The exact price is shown before you pay. Card, bank transfer or USSD through Paystack.",
    foot: "PAYSTACK SECURED · NO CASH AT THE COUNTER",
  },
  {
    n: "03",
    t: "Walk in, type, collect",
    b: "Six characters at the shop's kiosk, and your pages start printing. The code works for 24 hours.",
    foot: `VALID ${LIMITS.codeHours} HOURS · FILES STAY PRIVATE UNTIL YOU RELEASE THEM`,
  },
];

const FACTS: Array<{ to: number; suffix?: string; prefix?: string; label: string }> = [
  { to: LIMITS.fileMb, suffix: " MB", label: "MAX FILE SIZE" },
  { to: 6, label: "CHARACTERS TO COLLECT" },
  { to: LIMITS.codeHours, suffix: " hrs", label: "CODE VALIDITY" },
  { to: LIMITS.platformFeePct, suffix: "%", label: "PLATFORM FEE, ONLY WHEN SHOPS EARN" },
];

const FACT_BORDERS = ["border-r-2 border-b-2 md:border-b-0", "border-b-2 md:border-b-0 md:border-r-2", "border-r-2", ""];

export default function HomePage() {
  return (
    <>
      <Marquee
        reactive
        items={[
          { text: "● UPLOAD · PAY · COLLECT", accent: true },
          { text: "★ BUILT FOR NIGERIAN CAMPUSES" },
          { text: "CODES VALID 24 HOURS" },
          { text: "● GROUP PRINTING · EDIT & PRINT", accent: true },
          { text: "PAID THROUGH PAYSTACK" },
        ]}
      />

      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 lg:py-20 relative overflow-hidden">
        <div aria-hidden className="absolute -right-20 top-12 w-48 h-48 sm:w-72 sm:h-72 rounded-full bg-persimmon/10 pointer-events-none" />
        <div aria-hidden className="absolute -left-20 bottom-12 w-40 h-40 sm:w-60 sm:h-60 rounded-full bg-ochre/15 pointer-events-none" />
        <div className="relative z-10">
          <Reveal variant="rise">
            <div className="editorial-label text-persimmon mb-3">▸ THE PRINTLOOP DISPATCH</div>
          </Reveal>
          <HeroTitle />
          <Reveal variant="rise" delay={520}>
            <p className="pl-serif italic text-base sm:text-lg lg:text-xl text-ink/70 max-w-2xl mb-6 sm:mb-7 leading-snug">
              Upload from your phone. Pay online. Walk into a PrintLoop shop and your prints are waiting. No queue, no haggling, no USB sticks.
            </p>
          </Reveal>
          <Reveal variant="rise" delay={640}>
            <div className="flex flex-col sm:flex-row gap-3">
              <Magnetic>
                <a href={LINKS.register} className="pl-btn-primary w-full text-sm sm:text-base px-5 sm:px-7 py-3.5 sm:py-4 justify-center">
                  BEGIN YOUR ACCOUNT <span className="font-extrabold">→</span>
                </a>
              </Magnetic>
              <Magnetic>
                <Link href="/find" className="pl-btn-ghost w-full text-sm sm:text-base px-5 sm:px-7 py-3.5 sm:py-4 justify-center">
                  FIND A SHOP
                </Link>
              </Magnetic>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-10 sm:pb-12" aria-label="PrintLoop at a glance">
        <div className="border-2 border-ink grid grid-cols-2 md:grid-cols-4 bg-paper-light">
          {FACTS.map((f, i) => (
            <Reveal key={f.label} variant="rise" delay={i * 110} className={`p-5 sm:p-7 text-center border-ink ${FACT_BORDERS[i]}`}>
              <div className="pl-serif font-extrabold text-3xl sm:text-4xl lg:text-5xl tracking-tight mb-1">
                <Counter to={f.to} prefix={f.prefix} suffix={f.suffix} />
              </div>
              <div className="editorial-label text-ink/50 text-[9px] sm:text-[10px]">{f.label}</div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 border-t-2 border-ink">
        <Reveal variant="rise">
          <div className="editorial-label text-persimmon mb-2">▸ HOW IT WORKS</div>
        </Reveal>
        <Reveal variant="wipe" delay={100}>
          <h2 className="pl-serif font-bold text-[28px] sm:text-[36px] lg:text-[42px] leading-tight tracking-tight mb-6 sm:mb-9">
            Three moves. <em className="italic text-ochre">A small ritual.</em>
          </h2>
        </Reveal>
        <ol className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {STEPS.map((step, i) => (
            <li key={step.n}>
              <Reveal variant="rise" delay={i * 140} className="h-full">
                <div className="border-2 border-ink p-5 sm:p-6 h-full bg-paper-light transition-all duration-150 ease-out hover:-translate-x-[3px] hover:-translate-y-[3px] hover:shadow-[5px_5px_0_#1A1410]">
                  <div className="editorial-folio not-italic mb-3">
                    <span className="italic text-2xl">{step.n}</span>
                  </div>
                  <h3 className="pl-serif font-bold text-xl sm:text-2xl leading-tight tracking-tight mb-2">{step.t}</h3>
                  <p className="pl-serif italic text-ink/70 text-sm leading-snug mb-4">{step.b}</p>
                  <div className="pl-mono text-[10px] tracking-wider text-ink/40 border-t border-ink/15 pt-3">{step.foot}</div>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 border-t-2 border-ink">
        <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center">
          <Reveal variant="left">
            <div className="editorial-label text-persimmon mb-3">▸ EDIT &amp; PRINT</div>
            <h2 className="pl-serif font-bold text-[28px] sm:text-[36px] leading-tight tracking-tight mb-3">
              Not quite ready? <em className="italic text-ochre">Let the shop fix it.</em>
            </h2>
            <p className="pl-serif italic text-ink/70 leading-snug max-w-md">
              Ask your print shop to tidy a document before it prints. They edit it live, you review the result, and nothing prints or gets charged until you approve.
            </p>
          </Reveal>
          <Reveal variant="right" delay={150}>
            <div className="border-4 border-ink bg-paper-light p-6 shadow-[6px_6px_0_#1A1410]">
              <div className="editorial-label text-persimmon mb-4">GROUP PRINTING</div>
              <p className="pl-serif text-lg leading-snug mb-4">
                Course rep? Share one link, let everyone upload and pay for their own pages, and collect the whole class with a single code.
              </p>
              <a href={LINKS.groups} className="pl-link font-bold text-sm">
                Start a group →
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="bg-ink text-paper border-t-2 border-ink overflow-hidden">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 grid md:grid-cols-[1fr_auto] gap-8 items-center">
          <Reveal variant="left">
            <div className="editorial-label text-ochre mb-3">▸ FOR PRINT SHOPS</div>
            <h2 className="pl-serif font-bold text-[28px] sm:text-[36px] lg:text-[42px] leading-tight tracking-tight mb-3">
              Own a printer? <em className="italic text-persimmon">Run the loop.</em>
            </h2>
            <p className="pl-serif italic text-base sm:text-lg opacity-80 max-w-xl mb-4 leading-snug">
              We bring the customers, the payments and the queue; you press print. PrintLoop takes {LIMITS.platformFeePct}% only when you earn, and setup is a web wizard, not an IT project.
            </p>
            <div className="pl-mono text-[10px] tracking-wider opacity-50">PAYSTACK SPLIT · WEEKLY PAYOUTS · KIOSK APP</div>
          </Reveal>
          <Reveal variant="right" delay={150} className="flex flex-col gap-3 md:min-w-[230px]">
            <Magnetic>
              <a href={LINKS.openShop} className="pl-btn-primary w-full text-sm px-6 py-3.5 justify-center">
                OPEN YOUR SHOP →
              </a>
            </Magnetic>
            <Magnetic>
              <Link href="/pricing" className="pl-btn w-full bg-transparent text-paper border-paper text-sm px-6 py-3.5 justify-center hover:shadow-[5px_5px_0_#D14B2C]">
                SEE THE PRICING
              </Link>
            </Magnetic>
          </Reveal>
        </div>
      </section>

      <section className="bg-ink text-paper py-10 sm:py-14 px-4 sm:px-6 lg:px-8 border-t border-paper/15">
        <div className="max-w-5xl mx-auto text-center">
          <Reveal variant="rise">
            <div className="editorial-label text-persimmon mb-3">▸ JOIN THE LOOP</div>
          </Reveal>
          <Reveal variant="stamp" delay={120}>
            <h2 className="pl-serif font-bold text-[30px] sm:text-[38px] lg:text-[44px] leading-tight tracking-tight mb-3">Stop queueing. Start printing.</h2>
          </Reveal>
          <Reveal variant="rise" delay={260}>
            <p className="pl-serif italic text-base sm:text-lg opacity-80 mb-6 sm:mb-7 max-w-xl mx-auto">Find a shop near your campus and print your first page today.</p>
          </Reveal>
          <Reveal variant="rise" delay={380}>
            <Magnetic className="inline-block">
              <a href={LINKS.register} className="pl-btn-primary text-sm sm:text-base px-6 sm:px-7 py-3.5 sm:py-4 inline-block">
                CREATE YOUR ACCOUNT →
              </a>
            </Magnetic>
          </Reveal>
        </div>
      </section>
    </>
  );
}
