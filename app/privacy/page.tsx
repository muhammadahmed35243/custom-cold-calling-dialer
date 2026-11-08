import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy | JETZT Dialer",
  description: "How JETZT Dialer collects, uses, shares and protects information.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="November 8, 2026">
      <section>
        <p className="!mt-0">
          JETZT (&ldquo;JETZT&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) runs JETZT Dialer at{" "}
          <a href="https://dialer.thejetzt.com">dialer.thejetzt.com</a>: a calling platform for sales teams, with
          call recording, AI transcripts and follow-up emails, email inside the app, and an optional AI voice
          assistant that answers inbound calls. This policy explains what information we collect, how we use and
          share it, and the choices you have.
        </p>
        <p>
          JETZT Dialer is used by organizations (our customers) and the people they invite. For the leads, calls
          and other content an organization puts into JETZT Dialer, that organization decides how the information is
          used, and we process it on its behalf. For account and technical information, we are responsible.
        </p>
      </section>

      <section>
        <h2>Information we collect</h2>
        <h3>Account information</h3>
        <p>
          You sign in with your Google account. We receive your name, email address and profile picture from Google.
          Your organization&apos;s admin may also add details such as your role, a phone number for calling and an email
          alias.
        </p>
        <h3>Leads and contacts</h3>
        <p>
          Organizations upload or type in the people they plan to call: names, phone numbers, email addresses,
          companies, notes and any other columns in an uploaded spreadsheet.
        </p>
        <h3>Calls</h3>
        <p>
          For each call we keep the numbers involved, the caller ID used, times, duration, outcome, and the notes
          and dispositions agents enter. When recording is turned on for an organization, calls are recorded and a
          written transcript is created from the recording.
        </p>
        <h3>Email</h3>
        <p>
          If you or your organization connect a mailbox, we store the mailbox address, its server settings and either
          an encrypted password (or app password) or an encrypted access token from Google. Messages are loaded from
          the mailbox when you open them in JETZT Dialer; we don&apos;t keep copies of your emails on our servers. Emails
          you send are sent through your own mailbox.
        </p>
        <h3>AI voice assistant</h3>
        <p>
          When someone calls an organization&apos;s AI voice assistant, we process the caller&apos;s phone number and what
          they say so the assistant can understand and reply, and we keep a record of the call, any message the caller
          leaves and any appointment they book.
        </p>
        <h3>Messages you send us</h3>
        <p>
          When you use the contact form on our homepage or message JETZT from the admin portal, we receive your name,
          email address and what you write, plus your company and phone number if you add them. We use them to reply
          and keep them as a record of the conversation. For the homepage form we also keep a one-way hash of your IP
          address, never the address itself, to limit spam.
        </p>
        <h3>Technical information</h3>
        <p>
          Like most websites, our servers log IP addresses, browser type and request details to run and secure the
          service. We use only the cookies and browser storage needed to keep you signed in and to complete connections
          such as Google sign-in. We don&apos;t use advertising or tracking cookies, and we don&apos;t run third-party
          analytics.
        </p>
      </section>

      <section>
        <h2>How we use information</h2>
        <ul>
          <li>To provide JETZT Dialer: placing and recording calls, showing call history, managing leads and teams.</li>
          <li>To create call transcripts and draft follow-up emails from a call&apos;s notes and transcript.</li>
          <li>To run the AI voice assistant for organizations that use it.</li>
          <li>To measure usage, apply each organization&apos;s limits and budgets, and bill for the service.</li>
          <li>To keep the service secure, prevent fraud and abuse, and fix problems.</li>
          <li>To respond to support requests and meet legal obligations.</li>
        </ul>
        <p>
          We don&apos;t sell personal information, and we don&apos;t use it for advertising.
        </p>
      </section>

      <section id="google-user-data">
        <h2>Google user data</h2>
        <p>
          If you choose &ldquo;Sign in with Google&rdquo; to connect a Gmail or Google Workspace mailbox, JETZT Dialer asks
          Google for access to your Gmail account (the <code>https://mail.google.com/</code> permission) and your email
          address. We use this access only to:
        </p>
        <ul>
          <li>show your inbox, sent mail and other folders inside JETZT Dialer, and open the messages you select;</li>
          <li>send the emails you write or approve, such as follow-ups after a call, and save them to your Sent folder;</li>
          <li>identify which mailbox is connected.</li>
        </ul>
        <p>
          We store only the access token Google gives us, encrypted. Your emails are loaded from Gmail when you open
          them and are not stored on our servers. We don&apos;t send your Gmail messages to AI services, we don&apos;t use
          them to train AI models, and we don&apos;t sell them or use them for advertising. We share Google user data only
          as needed to provide the features you use, to comply with the law, or with your permission. People at JETZT
          don&apos;t read your email unless you ask us to for support, it&apos;s needed to investigate abuse or a security
          issue, or the law requires it.
        </p>
        <p>
          You can disconnect your mailbox at any time in JETZT Dialer, which deletes the stored token. You can also
          remove JETZT Dialer&apos;s access from your Google account at{" "}
          <a href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</a>.
        </p>
        <p>
          <strong>
            JETZT Dialer&apos;s use and transfer to any other app of information received from Google APIs will adhere to
            the{" "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy">
              Google API Services User Data Policy
            </a>
            , including the Limited Use requirements.
          </strong>
        </p>
      </section>

      <section>
        <h2>How we share information</h2>
        <p>
          Within an organization, its admins can see the calls, recordings, transcripts and notes of the people in it.
          Organizations never see each other&apos;s data. JETZT staff can access an organization&apos;s data when needed to
          run, support, bill and secure the service. We share information with the service providers that run parts
          of JETZT Dialer for us, only for that purpose:
        </p>
        <ul>
          <li><strong>Supabase</strong>: database, sign-in and file storage (including call recordings).</li>
          <li><strong>Vercel</strong>: hosting of the JETZT Dialer website.</li>
          <li><strong>Telnyx</strong>: phone calls, phone numbers and call recording.</li>
          <li><strong>OpenAI</strong>: transcribing call recordings and drafting follow-up emails.</li>
          <li>
            <strong>ElevenLabs, OpenAI and OpenRouter</strong>: speech and replies for the AI voice assistant.
          </li>
          <li><strong>Calendly</strong>: appointments booked through the AI voice assistant.</li>
          <li><strong>Google</strong>: sign-in, and Gmail if you connect it.</li>
          <li><strong>Your email provider</strong>: if you connect a mailbox from another provider.</li>
        </ul>
        <p>
          We may also share information if the law requires it, to protect people or the service from harm, or as part
          of a merger or sale of our business, in which case this policy continues to apply to it.
        </p>
      </section>

      <section>
        <h2>Where information is processed</h2>
        <p>
          Our service providers may process information in the United States and other countries, which may have
          different data protection laws from yours. We use providers that protect information as described in this
          policy.
        </p>
      </section>

      <section>
        <h2>How long we keep information</h2>
        <p>
          We keep information for as long as the organization&apos;s account is active, or until the organization or
          user deletes it. Organizations can delete leads at any time and can ask us to delete call recordings. When an
          organization&apos;s account is closed, we delete its information within 90 days, unless we must keep some of it
          longer to meet legal obligations or resolve disputes.
        </p>
      </section>

      <section>
        <h2>Security</h2>
        <p>
          All traffic to JETZT Dialer is encrypted in transit. Each organization&apos;s data is kept separate, so members of
          one organization can&apos;t see another&apos;s. Mailbox passwords and Google tokens are stored encrypted. Call recordings are
          stored privately and shared only through links that expire. No system is perfectly secure, so please tell us
          right away at <a href="mailto:support@thejetzt.com">support@thejetzt.com</a> if you notice anything wrong.
        </p>
      </section>

      <section>
        <h2>Your choices and rights</h2>
        <p>
          You can ask to see, correct, export or delete your information. If you use JETZT Dialer through an
          organization, contact its admin first, or write to us at{" "}
          <a href="mailto:support@thejetzt.com">support@thejetzt.com</a> and we&apos;ll help. If you were called by one of
          our customers and want your details removed, contact the company that called you; you can also write to us and
          we&apos;ll pass your request on.
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>JETZT Dialer is a business tool and isn&apos;t meant for anyone under 18.</p>
      </section>

      <section>
        <h2>Changes to this policy</h2>
        <p>
          We may update this policy as JETZT Dialer changes. We&apos;ll change the date at the top, and for significant
          changes we&apos;ll let organization admins know before they take effect.
        </p>
      </section>

      <section>
        <h2>Contact us</h2>
        <p>
          Questions about this policy or your information:{" "}
          <a href="mailto:contact@thejetzt.com">contact@thejetzt.com</a>. Help with the dialer:{" "}
          <a href="mailto:support@thejetzt.com">support@thejetzt.com</a>.
        </p>
      </section>
    </LegalPage>
  );
}
