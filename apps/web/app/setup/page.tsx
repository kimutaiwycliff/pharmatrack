import { redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/server"
import { SetupForm } from "@/components/setup/SetupForm"

export const metadata = { title: "Set up PharmaTrack" }
// Reads platform_admins (service-role) at request time — never prerender.
export const dynamic = "force-dynamic"

// First-run only: if a platform admin already exists, there's nothing to set up.
export default async function SetupPage() {
  const admin = createAdminClient()
  const { count } = await admin
    .from("platform_admins")
    .select("user_id", { count: "exact", head: true })
  if ((count ?? 0) > 0) redirect("/login")

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--pt-bg)] px-6 py-10">
      <div className="w-full max-w-[420px]">
        <div className="flex items-center gap-2 justify-center mb-7">
          <div className="w-9 h-9 rounded-lg bg-[var(--pt-green)] flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
          </div>
          <span className="text-xl font-bold tracking-tight text-[var(--pt-text)]">
            Pharma<span className="text-[var(--pt-green)]">Track</span>
          </span>
        </div>
        <SetupForm />
      </div>
    </div>
  )
}
