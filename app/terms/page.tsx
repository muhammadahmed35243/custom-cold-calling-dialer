import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service | JETZT Dialer",
  description: "The terms for using JETZT Dialer.",
};

export default function TermsOfServicePage() {
  return (
    <LegalPage title="Terms of Service" updated="November 8, 2026">
      <section>
        <p className="!mt-0">
          These terms apply to your use of JETZT Dialer at{" "}
          <a href="https://dialer.thejetzt.com">dialer.thejetzt.com</a>, run by JETZT (&ldquo;JETZT&rdquo;,
          &ldquo;we&rdquo;, &ldquo;us&rdquo;). By using JETZT Dialer you agree to them. If you use it on behalf of an
          organization, you confirm you&apos;re allowed to accept these terms for it.
        </p>
      </section>

      <section>
        <h2>The service</h2>
        <p>
          JETZT Dialer lets sales teams call leads by phone or from the browser, manage leads, record calls, get AI
          transcripts and follow-up email drafts, send and read email, use phone numbers we provide, and, where
          enabled, use an AI voice assistant that answers inbound calls. The features available to you depend on your
          organization&apos;s plan. We keep improving JETZT Dialer, so features may change.
        </p>
      </section>

      <section>
        <h2>Accounts</h2>
        <p>
          You sign in with your Google account. Each organization&apos;s admins invite and manage its users and are
          responsible for how their organization uses JETZT Dialer. Keep your account secure, and tell us at{" "}
          <a href="mailto:support@thejetzt.com">support@thejetzt.com</a> if you think someone else has used it.
        </p>
      </section>

      <section>
        <h2>Calling and messaging responsibly</h2>
        <p>
          You are responsible for the calls you make and the emails you send with JETZT Dialer, and for following
          every law that applies to them where you and the people you contact are. That includes rules on:
        </p>
        <ul>
          <li>consent to call or email someone, and calling only at permitted times;</li>
          <li>do-not-call lists and opt-out requests;</li>
          <li>telling people a call is recorded, and getting their consent where the law requires it;</li>
          <li>caller ID, telemarketing, anti-spam and data protection.</li>
        </ul>
        <p>
          You must have the right to use the lead data you upload and to contact those people. Where the law requires
          it, callers to the AI voice assistant must be told they&apos;re speaking with an automated system.
        </p>
        <p>You must not use JETZT Dialer to:</p>
        <ul>
          <li>harass, threaten, deceive or defraud anyone;</li>
          <li>make illegal robocalls, fake or spoof caller ID, or send spam;</li>
          <li>break the law or anyone else&apos;s rights;</li>
          <li>try to access another organization&apos;s data or another person&apos;s account;</li>
          <li>disrupt, overload, probe or reverse-engineer the service, or upload malicious code;</li>
          <li>resell the service without our written permission.</li>
        </ul>
      </section>

      <section>
        <h2>No emergency calls</h2>
        <p>
          JETZT Dialer can&apos;t be used to call emergency services such as 911, 112 or 15. Always keep another way to
          reach them.
        </p>
      </section>

      <section>
        <h2>Phone numbers</h2>
        <p>
          Phone numbers come from our telecom partners. Some countries require identity or address documents before a
          number can be used. Numbers stay with your organization while its account is in good standing; if an account
          is suspended or closed, we may release its numbers after giving notice. We can&apos;t guarantee that a specific
          number will be available or can be moved to another provider.
        </p>
      </section>

      <section>
        <h2>Fees, budgets and billing</h2>
        <p>
          Prices for your organization&apos;s plan, calls, phone numbers and the AI voice assistant are the ones agreed
          with JETZT. Usage is measured by JETZT Dialer. When an organization reaches its monthly budget, new calls stop
          until the budget is raised or the next month starts. Invoices are due as stated on them, and accounts with
          unpaid invoices may be suspended. Prices don&apos;t include taxes unless stated.
        </p>
      </section>

      <section>
        <h2>AI features</h2>
        <p>
          Transcripts, email drafts and the AI voice assistant&apos;s answers are generated automatically and can be
          wrong. Review them before relying on them, and check every email before you send it. You are responsible for
          the messages you send.
        </p>
      </section>

      <section>
        <h2>Your data</h2>
        <p>
          You and your organization keep ownership of the data you put into JETZT Dialer. You allow us to store,
          process and transmit it as needed to provide the service. Our{" "}
          <Link href="/privacy">Privacy Policy</Link> explains how we handle information.
        </p>
      </section>

      <section>
        <h2>Other services</h2>
        <p>
          JETZT Dialer works with services such as Google, Telnyx and your email provider, which have their own terms.
          We aren&apos;t responsible for those services, and an outage on their side can affect JETZT Dialer.
        </p>
      </section>

      <section>
        <h2>Suspension and closing accounts</h2>
        <p>
          You can stop using JETZT Dialer at any time. We may suspend or close access if these terms are broken,
          invoices go unpaid, the law requires it, or use of the service puts people, our partners or the service at
          risk. Where reasonable, we&apos;ll warn you first. What happens to data after an account closes is described in
          our <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </section>

      <section>
        <h2>Disclaimers</h2>
        <p>
          JETZT Dialer is provided &ldquo;as is&rdquo;. We work hard to keep it running well, but we don&apos;t promise it
          will always be available or error-free, or that every call or email will connect or be delivered.
        </p>
      </section>

      <section>
        <h2>Limitation of liability</h2>
        <p>
          To the extent the law allows, JETZT isn&apos;t liable for indirect or consequential losses, such as lost profits,
          revenue or data. Our total liability for any claim about JETZT Dialer is limited to the amount your
          organization paid us in the 12 months before the claim.
        </p>
      </section>

      <section>
        <h2>Indemnity</h2>
        <p>
          If a claim is brought against JETZT because of your calls, messages, data, or a breach of these terms or the
          law, you agree to cover the resulting costs and losses.
        </p>
      </section>

      <section>
        <h2>Changes to these terms</h2>
        <p>
          We may update these terms. We&apos;ll change the date at the top, and for significant changes we&apos;ll let
          organization admins know before they take effect. Continuing to use JETZT Dialer after that means you accept
          the updated terms.
        </p>
      </section>

      <section>
        <h2>Contact us</h2>
        <p>
          Questions about these terms: <a href="mailto:contact@thejetzt.com">contact@thejetzt.com</a>. Help with the
          dialer: <a href="mailto:support@thejetzt.com">support@thejetzt.com</a>.
        </p>
      </section>
    </LegalPage>
  );
}
