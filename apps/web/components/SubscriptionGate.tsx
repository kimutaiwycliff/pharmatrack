import { ShieldAlert, LogOut } from "lucide-react"
import { signOut } from "@/app/(auth)/login/actions"

const MESSAGES: Record<string, string> = {
  past_due: "Your subscription payment is overdue.",
  suspended: "Your subscription has been suspended.",
  cancelled: "Your subscription has been cancelled.",
  none: "No active subscription was found for this pharmacy.",
}

export function SubscriptionGate({ status, isOwner, orgName }: { status: string; isOwner: boolean; orgName?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--pt-bg)] text-[var(--pt-text)] p-6">
      <div className="max-w-md w-full bg-[var(--pt-surface)] rounded-2xl border border-[var(--pt-border)] p-8 text-center">
        <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-500/15 text-amber-600 dark:text-amber-300 flex items-center justify-center mx-auto mb-4">
          <ShieldAlert size={24} />
        </div>
        <h1 className="text-lg font-bold">Access paused</h1>
        {orgName && <p className="text-sm text-[var(--pt-text-secondary)] mt-1">{orgName}</p>}
        <p className="text-sm text-[var(--pt-text-secondary)] mt-3">{MESSAGES[status] ?? MESSAGES.none}</p>
        <p className="text-sm text-[var(--pt-text-secondary)] mt-2">
          {isOwner
            ? "Please contact PharmaTrack to restore access for your pharmacy."
            : "Please ask your pharmacy owner to renew the PharmaTrack subscription."}
        </p>
        <form action={signOut} className="mt-6">
          <button type="submit" className="inline-flex items-center gap-2 px-4 h-10 rounded-lg border border-[var(--pt-border)] text-sm font-semibold text-[var(--pt-text-secondary)] hover:bg-[var(--pt-muted)] transition-colors">
            <LogOut size={15} /> Sign out
          </button>
        </form>
      </div>
    </div>
  )
}
