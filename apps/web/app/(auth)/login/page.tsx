import { LoginForm } from "@/components/auth/LoginForm"

export const metadata = { title: "Sign in — PharmaTrack" }

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 py-8 bg-[var(--pt-bg)]">
      {/* decorative blob */}
      <div
        className="pointer-events-none absolute -top-16 -right-16 w-72 h-72 rounded-full opacity-60"
        style={{ background: "var(--pt-green-50)", filter: "blur(4px)" }}
      />
      <LoginForm />
    </div>
  )
}
