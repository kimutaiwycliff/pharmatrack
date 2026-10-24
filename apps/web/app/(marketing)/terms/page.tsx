import type { Metadata } from "next"
import Link from "next/link"
import { LegalPage } from "@/components/marketing/LegalPage"
import { platformContact } from "@/lib/platform-contact"
import { STANDARD_TRIAL_DAYS } from "@/lib/launch-offer"

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using PharmaTrack pharmacy software in Kenya — trials, subscriptions, your data, offline tills and your responsibilities as a pharmacy.",
  alternates: { canonical: "/terms" },
}

export default function TermsPage() {
  const email = platformContact().email ?? "sales@pharmatrack.co.ke"
  return (
    <LegalPage title="Terms of Service" updated="23 October 2026">
      <p>These terms apply when a pharmacy (&ldquo;you&rdquo;) uses PharmaTrack (&ldquo;we&rdquo;, &ldquo;the service&rdquo;) — the web app, the Windows app and the Android app. By creating an account you accept them on behalf of your pharmacy.</p>

      <h2>1. The service</h2>
      <p>PharmaTrack provides point-of-sale, stock, purchasing, prescriptions, appointments, reports and related tools for pharmacies in Kenya. We may improve or change features over time; we will tell you in advance about changes that remove something you rely on.</p>

      <h2>2. Your account and staff</h2>
      <ul>
        <li>The person who signs up confirms they may act for the pharmacy.</li>
        <li>You decide who on your team gets access and with which role, and you are responsible for what is done under your staff&apos;s accounts and PINs. Remove staff who leave.</li>
        <li>Keep passwords and PINs private and tell us straight away if you think an account has been misused.</li>
      </ul>

      <h2>3. Your professional and legal responsibilities</h2>
      <ul>
        <li>You must hold the licences your pharmacy needs, including from the Pharmacy and Poisons Board.</li>
        <li>PharmaTrack is a record-keeping and selling tool. Features such as drug-interaction checks, prescription flags and the controlled-substances register help you but <strong>do not replace a pharmacist&apos;s professional judgement</strong>. Catalogue information can be incomplete — check what you dispense.</li>
        <li>You remain responsible for the accuracy of the records you keep and for your obligations to regulators, including PPB record-keeping and KRA tax and invoicing requirements. PharmaTrack does not currently submit invoices to KRA eTIMS.</li>
      </ul>

      <h2>4. Trials, plans and payment</h2>
      <ul>
        <li>New pharmacies get a {STANDARD_TRIAL_DAYS}-day free trial. One free trial per person.</li>
        <li>After the trial, plans are billed monthly or annually in Kenya shillings at the prices shown on our pricing section, unless we agree otherwise in writing.</li>
        <li>If a payment is overdue we may limit or suspend access until it is paid. Suspension does not delete your data.</li>
        <li>You can stop at any time; fees already paid for a period are not refunded unless the law requires it.</li>
      </ul>

      <h2>5. Your data</h2>
      <p>Your pharmacy&apos;s records belong to you. You give us permission to store and process them only to provide, secure and support the service, as described in our <Link href="/privacy">Privacy Policy</Link>. You can export your products, stock and reports at any time.</p>

      <h2>6. Offline tills</h2>
      <p>Tills can sell without internet. Sales made offline are kept on that device until it reconnects and syncs, and a till must sync at least once a day to keep selling offline. Data on a device that is lost, wiped or never reconnects may not reach your account — connect tills regularly and keep devices safe.</p>

      <h2>7. Acceptable use</h2>
      <p>Don&apos;t use PharmaTrack to break the law (including selling medicines without the required authority), to try to access another pharmacy&apos;s data, to overload or attack the service, or to copy or resell it.</p>

      <h2>8. Availability</h2>
      <p>We work to keep PharmaTrack available and your data backed up, but we cannot promise the service will be uninterrupted or error-free. Planned maintenance is done outside normal trading hours where possible.</p>

      <h2>9. Liability</h2>
      <p>To the extent the law allows, we are not liable for indirect losses such as lost profit or lost business, and our total liability for any claim is limited to the fees you paid us in the 12 months before it arose. Nothing here limits liability that cannot be limited under Kenyan law.</p>

      <h2>10. Ending the service</h2>
      <p>You can close your account at any time. We may suspend or close an account that seriously or repeatedly breaks these terms, after notice where reasonable. After closure, records are handled as set out in the Privacy Policy, so export what you need first.</p>

      <h2>11. Changes and law</h2>
      <p>We may update these terms; we will show the date at the top and tell account owners about important changes. These terms are governed by the laws of Kenya.</p>

      <h2>Contact</h2>
      <p><a href={`mailto:${email}`}>{email}</a></p>
    </LegalPage>
  )
}
