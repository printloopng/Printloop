import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Mail } from "@/components/Legal";
import { LIMITS, SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms that apply to customers and print shops using PrintLoop.",
};

const DEFINITIONS = [
  ["Platform", "The PrintLoop service: API, customer app, shop console, backoffice, kiosk app and render worker."],
  ["Shop", "A printing business that signs up to the Platform and operates kiosks."],
  ["Customer", "A person who uploads documents, pays, and collects prints."],
  ["Kiosk", "The terminal at a shop that runs the PrintLoop Kiosk app and prints jobs."],
  ["Commission", `The percentage of each customer payment retained by PrintLoop (default ${LIMITS.platformFeePct}%).`],
  ["Payout", "A transfer of a shop's net earnings to its bank account."],
];

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" other={{ href: "/privacy", label: "Privacy Policy" }}>
      <h2>1. Agreement to terms</h2>
      <p>
        By using PrintLoop (&ldquo;the Platform&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) you agree to these Terms and to our <Link href="/privacy">Privacy Policy</Link>. If you do not agree, do not use the Platform.
      </p>

      <h2>2. Definitions</h2>
      <dl>
        {DEFINITIONS.map(([term, meaning]) => (
          <div key={term}>
            <dt><strong>&ldquo;{term}&rdquo;</strong></dt>
            <dd>{meaning}</dd>
          </div>
        ))}
      </dl>

      <h2>3. Shop obligations</h2>
      <p>By registering a shop, you agree to:</p>
      <ul>
        <li>Give accurate business information and keep it up to date.</li>
        <li>Set up a valid Nigerian bank account for payouts.</li>
        <li>Set fair, transparent prices.</li>
        <li>Keep your kiosks working, and run a test print before going live.</li>
        <li>Comply with Nigerian law, including tax, consumer protection and data protection.</li>
        <li>Not resell or sub-license the Platform, or reverse-engineer the kiosk app.</li>
      </ul>

      <h2>4. Customer terms</h2>
      <p>By uploading a document and paying, you agree that:</p>
      <ul>
        <li>The document is your own work or you have the right to print it.</li>
        <li>The final page count, confirmed after conversion, sets the final cost.</li>
        <li>Your release code is the proof of payment, so treat it like cash.</li>
        <li>Prints must be collected within {LIMITS.codeHours} hours, after which the job expires.</li>
        <li>You will not upload illegal, obscene or infringing content.</li>
      </ul>

      <h2>5. Payments and commission</h2>
      <ul>
        <li>All customer payments are processed by <strong>Paystack</strong>.</li>
        <li>When a customer pays, Paystack split routes the shop&apos;s share to the shop and PrintLoop&apos;s commission to PrintLoop.</li>
        <li>The default commission is {LIMITS.platformFeePct}%. It is shown in the shop console and can differ per shop by agreement.</li>
        <li>There are no monthly, per-kiosk or subscription fees.</li>
        <li>If a print fails, the customer can raise a dispute with the shop. Refunds are settled between the shop, the customer and PrintLoop as the outcome requires.</li>
      </ul>

      <h2>6. Payouts to shops</h2>
      <ul>
        <li>Payouts run weekly (Fridays) with a minimum balance of ₦5,000. Instant payouts may be offered for a fee shown before you confirm.</li>
        <li>A shop needs a verified bank account to be paid.</li>
        <li>Payouts are initiated by PrintLoop and their status is shown in the shop console.</li>
        <li>Failed transfers are retried; the funds stay on your balance.</li>
      </ul>

      <h2>7. Branding</h2>
      <p>Shops may set their own name, logo, colours and support contacts. Branding applies to the customer app, receipts and emails for that shop.</p>

      <h2>8. Custom domains</h2>
      <p>A shop may serve its customer page from its own domain. To prove ownership it must publish the DNS records shown in its settings.</p>

      <h2>9. Intellectual property</h2>
      <ul>
        <li>PrintLoop owns the Platform, its software and its design system.</li>
        <li>Shops keep ownership of their logos, branding and content.</li>
        <li>Customers keep ownership of their documents. PrintLoop claims no rights in them.</li>
      </ul>

      <h2>10. Suspension and termination</h2>
      <ul>
        <li>PrintLoop may suspend a shop for material breach, a legal order, or a risk to customers. Suspended shops cannot take new orders.</li>
        <li>A shop may close its account at any time, followed by a 30-day cooling-off period and then deletion.</li>
        <li>On closure, kiosks stop accepting jobs and any balance owed is paid out before data is deleted.</li>
      </ul>

      <h2>11. Disclaimer of warranties</h2>
      <p>
        The Platform is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. We do not promise uninterrupted or error-free operation. Print quality depends on each shop&apos;s printer and supplies, and PrintLoop is not liable for toner, paper or mechanical failures.
      </p>

      <h2>12. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, PrintLoop&apos;s total liability for any claim under these Terms is limited to the commission paid by the shop in the 12 months before the claim. We are not liable for indirect or consequential loss such as lost profit, data loss or business interruption.
      </p>

      <h2>13. Indemnification</h2>
      <p>Shops indemnify PrintLoop against claims arising from their use of the Platform, such as customer disputes or regulatory breaches. Customers indemnify shops for illegal content they upload.</p>

      <h2>14. Governing law and disputes</h2>
      <p>These Terms are governed by the laws of the Federal Republic of Nigeria. Disputes are resolved by binding arbitration in Lagos. Either party may seek urgent relief in any competent court.</p>

      <h2>15. Changes</h2>
      <p>We may update these Terms. We email material changes 30 days in advance and post them here with a new date. Continuing to use the Platform after that date means you accept them.</p>

      <h2>16. Contact</h2>
      <p>
        Questions about these Terms? Email <Mail to={SITE.legalEmail} /> or write to PrintLoop, Lagos, Nigeria.
      </p>
    </LegalPage>
  );
}
