import { redirect } from "next/navigation"
import { dbAdmin, platform_admin } from "@pharmatrack/db"
import { LoginForm } from "@/components/auth/LoginForm"

export const metadata = { title: "Sign in — PharmaTrack" }
// Reads platform_admins (service-role) to route first-run installs to /setup —
// must run per request, never prerendered at build (no DB/secret there).
export const dynamic = "force-dynamic"

const FEATURES = [
  { icon: "📦", label: "Barcode scanning & FEFO inventory" },
  { icon: "📱", label: "M-Pesa & cash payment flows" },
  { icon: "📊", label: "Shift reports & sales analytics" },
  { icon: "🔒", label: "Role-based access control" },
]

export default async function LoginPage() {
  // Brand-new install with no operator yet → send to first-run setup.
  const admins = await dbAdmin().select().from(platform_admin)
  if (admins.length === 0) redirect("/setup")

  return (
    <div className="min-h-screen flex bg-[var(--pt-bg)]">
      {/* Left — branding panel (desktop only) */}
      <div className="hidden lg:flex lg:w-[52%] flex-col justify-between p-12 bg-[var(--pt-green)] relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-white/5" />
        <div className="absolute -bottom-32 -right-20 w-96 h-96 rounded-full bg-white/5" />
        <div className="absolute top-1/2 -right-16 w-64 h-64 rounded-full bg-white/5" />

        {/* Logo */}
        <div className="relative flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>
          <span className="text-2xl font-bold tracking-tight text-white">PharmaTrack</span>
        </div>

        {/* Hero text */}
        <div className="relative space-y-6">
          <div className="space-y-3">
            <p className="text-[11px] font-bold text-white/60 uppercase tracking-[0.15em]">
              Pharmacy Management
            </p>
            <h1 className="text-4xl font-bold text-white leading-tight tracking-tight">
              Modern POS built for Kenyan pharmacies
            </h1>
            <p className="text-base text-white/75 leading-relaxed max-w-md">
              Scan, sell, and track inventory in real time. M-Pesa payments, FEFO batch management,
              and offline-first by design.
            </p>
          </div>

          <ul className="space-y-3">
            {FEATURES.map(({ icon, label }) => (
              <li key={label} className="flex items-center gap-3 text-white/90 text-sm font-medium">
                <span className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center text-base shrink-0">
                  {icon}
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <p className="relative text-[11px] text-white/40 tracking-wider uppercase">
          © {new Date().getFullYear()} PharmaTrack
        </p>
      </div>

      {/* Right — login form */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 lg:py-0 relative">
        {/* Decorative blob — mobile/tablet only */}
        <div
          className="lg:hidden pointer-events-none absolute -top-16 -right-16 w-72 h-72 rounded-full opacity-60"
          style={{ background: "var(--pt-green-50)", filter: "blur(4px)" }}
        />

        <div className="w-full max-w-[420px] relative">
          {/* Mobile-only logo */}
          <div className="flex items-center gap-2 justify-center mb-7 lg:hidden">
            <div className="w-9 h-9 rounded-lg bg-[var(--pt-green)] flex items-center justify-center">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight text-[var(--pt-text)]">
              Pharma<span className="text-[var(--pt-green)]">Track</span>
            </span>
          </div>

          <LoginForm />
        </div>
      </div>
    </div>
  )
}
