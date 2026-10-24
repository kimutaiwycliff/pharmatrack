import type { Metadata } from "next"
import Link from "next/link"
import { LegalPage } from "@/components/marketing/LegalPage"
import { platformContact } from "@/lib/platform-contact"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How PharmaTrack collects, uses and protects personal data for Kenyan pharmacies, their staff and their customers, under the Kenya Data Protection Act, 2019.",
  alternates: { canonical: "/privacy" },
}

// Describes what the system actually does (insights: ADR-017; offline tills:
// ADR-016). Update this page whenever a new processor or data use is added.
export default function PrivacyPage() {
  const email = platformContact().email ?? "sales@pharmatrack.co.ke"
  return (
    <LegalPage title="Privacy Policy" updated="23 October 2026">
      <p>PharmaTrack is pharmacy software for Kenya: a till, stock, prescriptions and reports for pharmacies and their staff. This policy explains what personal data we handle, why, who else touches it, and the rights you have under the <strong>Kenya Data Protection Act, 2019</strong>.</p>

      <h2>Who is responsible for what</h2>
      <ul>
        <li><strong>Your pharmacy&apos;s records</strong> — customers, patients, prescriptions, sales and the controlled-substances register — belong to the pharmacy. The pharmacy is the <em>data controller</em>; PharmaTrack processes those records on its behalf and only to run the service.</li>
        <li><strong>Accounts and this website</strong> — the people who sign up and sign in, and visitors to this site — PharmaTrack is the data controller.</li>
      </ul>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> name, email, phone number, role and branch. Passwords and till PINs are stored only as one-way hashes.</li>
        <li><strong>Pharmacy records you enter:</strong> products, prices, stock and batches; sales, payments (including M-Pesa phone numbers and receipt codes); customers&apos; names, phone numbers, allergies and appointments; prescriptions; pharmacist and prescriber names and registration numbers for the controlled-substances register.</li>
        <li><strong>Usage:</strong> when each person signs in and which app they use (web, Windows or Android), recorded once per day, plus the tills (devices) registered to your pharmacy.</li>
        <li><strong>Technical data:</strong> IP address and browser details for security and rate limiting, and error reports when something breaks.</li>
        <li><strong>Website analytics:</strong> on our public pages only (not inside the app) we may use Google Analytics or Cloudflare Web Analytics to count visits.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To run the service: selling, syncing offline tills, reports, receipts, reminders and emails you ask for.</li>
        <li>To keep it secure: sign-in protection, lockouts after repeated wrong PINs or passwords, audit logs.</li>
        <li>To support you and bill your subscription.</li>
        <li><strong>Account health:</strong> our team can see, per pharmacy, how often staff sign in and use the system, and totals for sales, profit and stock value. We use this only to help you — for example to contact you if your pharmacy stops using PharmaTrack — and never share it.</li>
      </ul>
      <p>We do not sell personal data, and we do not use your pharmacy&apos;s records for advertising.</p>

      <h2>Who else processes data</h2>
      <p>We use a small number of service providers, each only for the job listed:</p>
      <ul>
        <li><strong>Amazon Web Services</strong> — servers and database hosting.</li>
        <li><strong>Cloudflare</strong> — secure network delivery, app download files and the anti-bot check on sign-in.</li>
        <li><strong>Resend</strong> — sending emails (invitations, password resets, reminders and summaries).</li>
        <li><strong>Google</strong> — &ldquo;Sign in with Google&rdquo; if you choose it, and website analytics where enabled.</li>
        <li><strong>Safaricom (M-Pesa)</strong> — only if your pharmacy switches on M-Pesa STK Push, to send payment prompts to your customers.</li>
        <li><strong>Error monitoring</strong> — technical error reports so we can fix problems.</li>
      </ul>
      <p>Some of these providers store data outside Kenya. Where that happens we rely on the safeguards the Data Protection Act requires for cross-border transfers.</p>

      <h2>How we protect it</h2>
      <ul>
        <li>All traffic is encrypted in transit; M-Pesa credentials are encrypted at rest.</li>
        <li>Each pharmacy&apos;s data is isolated at the database level, so one pharmacy can never see another&apos;s records.</li>
        <li>Inside a pharmacy, staff only see what their role allows.</li>
        <li>Offline tills keep a copy of the branch&apos;s products and recent sales on the device until they sync — keep till devices locked and sign staff out when they leave.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>We keep your pharmacy&apos;s records while your account is open. If you close your account, export what you need first; we then delete or anonymise the records within 90 days, except where Kenyan law requires them to be kept longer (for example tax or pharmacy-register records), in which case we keep only what is required.</p>

      <h2>Your rights</h2>
      <p>Under the Data Protection Act you can ask to see, correct or delete your personal data, object to its use, or get a copy in a portable format. If you are a pharmacy&apos;s customer, please ask that pharmacy first — they control your records — and we will help them respond. You can also complain to the <a href="https://www.odpc.go.ke" rel="noopener">Office of the Data Protection Commissioner</a>.</p>

      <h2>Contact</h2>
      <p>Questions or requests: <a href={`mailto:${email}`}>{email}</a>. See also our <Link href="/terms">Terms of Service</Link>.</p>
    </LegalPage>
  )
}
