import type { Metadata } from "next";
import { LegalPage, Mail } from "@/components/Legal";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What PrintLoop collects, why, who we share it with, how long we keep it and how to exercise your rights.",
};

const BASES = [
  ["Provide the printing service (upload, pay, collect)", "Contract (Art. 6(1)(b))"],
  ["Process payments and issue receipts", "Contract and legal obligation (Art. 6(1)(b), (c))"],
  ["Send job-ready codes by SMS or email", "Legitimate interest (Art. 6(1)(f))"],
  ["Fraud prevention and rate limiting", "Legitimate interest (Art. 6(1)(f))"],
  ["Comply with tax and anti-money-laundering laws", "Legal obligation (Art. 6(1)(c))"],
  ["Improve the service", "Consent (Art. 6(1)(a)) where required"],
];

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" other={{ href: "/terms", label: "Terms of Service" }}>
      <h2>1. Who we are</h2>
      <p>
        PrintLoop (&ldquo;we&rdquo;, &ldquo;us&rdquo;) is the data controller for personal data processed through our printing platform. Registered address: PrintLoop, Lagos, Nigeria. Contact: <Mail to={SITE.privacyEmail} />.
      </p>

      <h2>2. Information we collect</h2>
      <h3>2.1 Data you give us</h3>
      <ul>
        <li><strong>Account data:</strong> name, email, phone number and a hashed password.</li>
        <li><strong>Print jobs:</strong> uploaded documents, page counts, print settings and timestamps.</li>
        <li><strong>Payments:</strong> Paystack transaction references and amounts.</li>
        <li><strong>Print shops:</strong> business name, address, and the bank details needed to pay you out.</li>
      </ul>
      <h3>2.2 Data we generate</h3>
      <ul>
        <li>Release codes, job statuses and page counts.</li>
        <li>A transaction ledger (gross, commission, net).</li>
        <li>Kiosk check-ins and printer capabilities.</li>
        <li>Audit logs of sensitive actions.</li>
      </ul>
      <h3>2.3 Data from third parties</h3>
      <ul>
        <li>Paystack: payment confirmation and customer contact details.</li>
        <li>Our SMS provider: delivery receipts.</li>
        <li>A geocoding service: map coordinates for a shop address.</li>
      </ul>

      <h2>3. Lawful bases (GDPR Art. 6 / NDPR)</h2>
      <table>
        <thead>
          <tr>
            <th>Purpose</th>
            <th>Lawful basis</th>
          </tr>
        </thead>
        <tbody>
          {BASES.map(([purpose, basis]) => (
            <tr key={purpose}>
              <td>{purpose}</td>
              <td>{basis}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>4. Data sharing</h2>
      <p>
        We do <strong>not</strong> sell personal data. We share it only with:
      </p>
      <ul>
        <li><strong>Paystack:</strong> to process payments, split commission and send payouts.</li>
        <li><strong>Messaging providers:</strong> to deliver codes and notices by SMS and email.</li>
        <li><strong>Hosting and storage providers:</strong> to run the platform, under data-processing agreements.</li>
        <li><strong>The print shop you choose:</strong> your name, job code and page count, which is what it needs to release your print.</li>
        <li><strong>Authorities:</strong> only when legally compelled.</li>
      </ul>

      <h2>5. International transfers</h2>
      <p>
        Our hosting providers may process data outside Nigeria. Where they do, we rely on standard contractual clauses or adequacy decisions. You can request a copy by emailing <Mail to={SITE.privacyEmail} />.
      </p>

      <h2>6. Retention</h2>
      <ul>
        <li><strong>Account data:</strong> kept while your account is active and for 30 days after you close it.</li>
        <li><strong>Print jobs and documents:</strong> deleted after the job completes or expires.</li>
        <li><strong>Transactions and audit logs:</strong> kept for 7 years for tax and anti-money-laundering compliance.</li>
      </ul>

      <h2>7. Your rights (GDPR Art. 15&ndash;22 / NDPR)</h2>
      <p>
        You can exercise these rights at any time from your account settings or by emailing <Mail to={SITE.privacyEmail} />:
      </p>
      <ul>
        <li><strong>Access and portability:</strong> download a copy of your data from your account settings.</li>
        <li><strong>Rectification:</strong> correct inaccurate data.</li>
        <li><strong>Erasure:</strong> close your account, followed by a 30-day cooling-off period and then deletion.</li>
        <li><strong>Restriction and objection:</strong> limit or object to processing based on legitimate interest.</li>
        <li><strong>Withdraw consent:</strong> where we rely on consent.</li>
      </ul>

      <h2>8. Cookies</h2>
      <p>We use only strictly necessary cookies:</p>
      <ul>
        <li><code>pl_session</code> (HttpOnly, Secure, SameSite=Lax): keeps you signed in for up to 7 days.</li>
        <li><code>pl_shop</code>: remembers which print shop you picked.</li>
        <li><code>pl_impersonating</code>: set only during a support session started by PrintLoop staff at a shop&apos;s request.</li>
      </ul>
      <p>We do not use analytics, advertising or third-party tracking cookies.</p>

      <h2>9. Security</h2>
      <ul>
        <li>Passwords are stored as bcrypt hashes.</li>
        <li>Sessions use signed tokens in an HttpOnly cookie, never in page-accessible storage.</li>
        <li>Encrypted connections everywhere, with a strict content security policy and same-origin checks on changes.</li>
        <li>Rate limits and brute-force protection on sign-in and release codes.</li>
        <li>Optional two-step sign-in for all accounts, and required for PrintLoop staff.</li>
        <li>Support sessions are time-limited, scoped to one shop and written to the audit log.</li>
      </ul>

      <h2>10. Children</h2>
      <p>PrintLoop is not directed at children under 16. If you believe a child has given us data, contact us and we will delete it.</p>

      <h2>11. Changes to this policy</h2>
      <p>We post updates here and change the &ldquo;Last updated&rdquo; date. We email active users about material changes 30 days in advance.</p>

      <h2>12. Contact</h2>
      <p>
        Data Protection Officer: <strong>Abdurrahman Bello</strong>
        <br />
        Email: <Mail to={SITE.privacyEmail} />
        <br />
        Postal: PrintLoop, Lagos, Nigeria
      </p>
    </LegalPage>
  );
}
