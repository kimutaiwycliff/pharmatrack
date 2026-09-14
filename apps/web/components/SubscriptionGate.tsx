import { ShieldAlert, LogOut, Mail, MessageCircle } from "lucide-react"
import { signOut } from "@/app/(auth)/login/actions"
import { platformContact } from "@/lib/platform-contact"
import { PaymentClaimBox } from "@/components/billing/PaymentClaimBox"

const MESSAGES: Record<string, string> = {
  // Generic enough to cover both a lapsed trial (never paid) and a missed
  // renewal — the nicer, trial-specific copy below only applies in the window
  // before the expiry sweep flips the stored status away from "trialing".
  past_due: "Your free trial or subscription payment is due.",
  suspended: "Your subscription has been suspended.",
  cancelled: "Your subscription has been cancelled.",
  none: "No active subscription was found for this pharmacy.",
}

export function SubscriptionGate({
  status, trialExpired, isOwner, orgName,
}: { status: string; trialExpired?: boolean; isOwner: boolean; orgName?: string }) {
  const contact = platformContact()
  const hasContact = !!(contact.mailtoLink || contact.whatsappLink)
  const message = trialExpired && status === "past_due" ? "Your free trial has ended." : (MESSAGES[status] ?? MESSAGES.none)
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--pt-bg)] text-[var(--pt-text)] p-6">
      <div className="max-w-md w-full bg-[var(--pt-surface)] rounded-2xl border border-[var(--pt-border)] p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-300 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert size={24} />
        </div>
        <h1 className="text-lg font-bold">Access paused</h1>
        {orgName && <p className="text-sm text-[var(--pt-text-secondary)] mt-1">{orgName}</p>}
        <p className="text-sm text-[var(--pt-text-secondary)] mt-3">{message}</p>
        <p className="text-sm text-[var(--pt-text-secondary)] mt-2">
          {isOwner
            ? "Pay below, or contact PharmaTrack to restore access for your pharmacy."
            : "Please ask your pharmacy owner to renew the PharmaTrack subscription."}
        </p>

        {isOwner && <PaymentClaimBox />}

        {/* Contact the platform operator (env-configurable) */}
        {hasContact && (
          <div className="mt-5 flex flex-col sm:flex-row gap-2 justify-center">
            {contact.whatsappLink && (
              <a
                href={contact.whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 h-10 rounded-lg bg-[var(--pt-green)] text-white text-sm font-semibold hover:bg-[var(--pt-green-600)] transition-colors"
              >
                <MessageCircle size={15} /> WhatsApp us
              </a>
            )}
            {contact.mailtoLink && (
              <a
                href={contact.mailtoLink}
                className="inline-flex items-center justify-center gap-2 px-4 h-10 rounded-lg border border-[var(--pt-border)] text-sm font-semibold text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)] transition-colors"
              >
                <Mail size={15} /> Email us
              </a>
            )}
          </div>
        )}

        <form action={signOut} className="mt-6">
          <button type="submit" className="inline-flex items-center gap-2 px-4 h-10 rounded-lg border border-[var(--pt-border)] text-sm font-semibold text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)] transition-colors">
            <LogOut size={15} /> Sign out
          </button>
        </form>
      </div>
    </div>
  )
}
