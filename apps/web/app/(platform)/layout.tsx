import { redirect } from "next/navigation"
import Link from "next/link"
import { getSession, isPlatformAdmin } from "@/lib/auth/helpers"
import { signOut } from "@/app/(auth)/login/actions"
import { PlatformProviders } from "@/components/platform/PlatformProviders"
import { LogOut, ShieldCheck } from "lucide-react"

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session?.user) redirect("/login")
  if (!(await isPlatformAdmin())) redirect("/dashboard")
  const user = session.user

  return (
    <PlatformProviders>
      <div className="min-h-screen bg-[var(--pt-bg)] text-[var(--pt-text)]">
        <header className="h-14 border-b border-[var(--pt-border)] bg-[var(--pt-surface)] flex items-center px-4 sm:px-6 gap-3 sticky top-0 z-10">
          <Link href="/platform" className="flex items-center gap-2 font-bold">
            <span className="w-7 h-7 rounded-lg bg-[var(--pt-green)] flex items-center justify-center text-white"><ShieldCheck size={16} /></span>
            Pharma<span className="text-[var(--pt-green)]">Track</span>
            <span className="ml-1 text-[11px] font-semibold px-1.5 py-0.5 rounded bg-[var(--pt-muted-strong)] text-[var(--pt-text-secondary)] uppercase tracking-wide">Platform</span>
          </Link>
          <div className="flex-1" />
          <span className="text-[13px] text-[var(--pt-text-secondary)] hidden sm:block">{user.email}</span>
          <form action={signOut}>
            <button type="submit" title="Sign out" className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--pt-text-tertiary)] hover:bg-[var(--pt-muted)] transition-colors">
              <LogOut size={15} />
            </button>
          </form>
        </header>
        <main className="p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </PlatformProviders>
  )
}
