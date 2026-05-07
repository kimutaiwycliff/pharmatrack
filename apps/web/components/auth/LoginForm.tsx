"use client"

import { useActionState, useState } from "react"
import { signInWithEmail, signInWithPin, type ActionState } from "@/app/(auth)/login/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PinLoginForm } from "./PinLoginForm"
import { Eye, EyeOff } from "lucide-react"

const initial: ActionState = {}

export function LoginForm() {
  const [tab, setTab] = useState<"email" | "pin">("email")
  const [showPassword, setShowPassword] = useState(false)
  const [emailState, emailAction, emailPending] = useActionState(signInWithEmail, initial)
  const [pinState, pinAction, pinPending] = useActionState(signInWithPin, initial)

  return (
    <div className="w-full">
      <div className="bg-white rounded-xl border border-[var(--pt-border)] shadow-sm p-8">
        <h1 className="text-xl font-bold tracking-tight text-[var(--pt-text)] mb-1">Welcome back</h1>
        <p className="text-sm text-[var(--pt-text-secondary)] mb-6">Sign in to start your shift</p>

        {/* Tab switcher */}
        <div className="grid grid-cols-2 bg-gray-100 rounded-lg p-1 mb-5">
          {(["email", "pin"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={[
                "h-9 rounded-md text-sm font-semibold transition-all",
                tab === t
                  ? "bg-white text-[var(--pt-text)] shadow-sm"
                  : "text-[var(--pt-text-secondary)] hover:text-[var(--pt-text)]",
              ].join(" ")}
            >
              {t === "email" ? "Email Login" : "Quick PIN Login"}
            </button>
          ))}
        </div>

        {tab === "email" ? (
          <form action={emailAction} className="space-y-4">
            <div>
              <Label htmlFor="email" className="text-sm font-medium">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@pharmacy.co.ke"
                className="mt-1.5 h-11"
                required
              />
            </div>
            <div>
              <Label htmlFor="password" className="text-sm font-medium mb-1.5 block">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="h-11 pr-11"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--pt-text-tertiary)] hover:text-[var(--pt-text-secondary)] transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {emailState.error && (
              <p className="text-sm text-[var(--pt-red)] bg-[var(--pt-red-50)] px-3 py-2 rounded-lg">
                {emailState.error}
              </p>
            )}

            <Button
              type="submit"
              disabled={emailPending}
              className="w-full h-11 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white font-semibold mt-2"
            >
              {emailPending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        ) : (
          <PinLoginForm action={pinAction} pending={pinPending} error={pinState.error} />
        )}
      </div>

      <p className="text-center text-[10px] text-[var(--pt-text-tertiary)] tracking-widest uppercase mt-6">
        Powered by <span className="font-semibold text-[var(--pt-text-secondary)]">PharmaTrack</span>
      </p>
    </div>
  )
}
