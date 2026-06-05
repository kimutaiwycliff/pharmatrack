"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Delete } from "lucide-react"

interface PinLoginFormProps {
  action: (formData: FormData) => void
  pending: boolean
  error?: string
}

const PAD = ["1","2","3","4","5","6","7","8","9","","0","del"] as const

export function PinLoginForm({ action, pending, error }: PinLoginFormProps) {
  const [phone, setPhone] = useState("")
  const [pin, setPin] = useState("")

  function onKey(k: string) {
    if (k === "del") setPin((p) => p.slice(0, -1))
    else if (pin.length < 4) setPin((p) => p + k)
  }

  function handleSubmit() {
    const fd = new FormData()
    fd.set("phone", phone)
    fd.set("pin", pin)
    action(fd)
  }

  return (
    <div className="space-y-4">
      {/* Phone number */}
      <div>
        <Label className="text-sm font-medium">Phone number</Label>
        <div className="flex items-center gap-2 mt-1.5">
          <div className="h-11 px-3 rounded-lg border border-[var(--pt-border-strong)] flex items-center gap-1.5 text-sm font-medium bg-[var(--pt-surface)] shrink-0 select-none">
            🇰🇪 +254
          </div>
          <Input
            name="phone-display"
            type="tel"
            placeholder="712 345 678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-11"
          />
        </div>
      </div>

      {/* PIN dots */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium">Enter 4-digit PIN</span>
          <span className="text-xs text-[var(--pt-text-secondary)]">{pin.length}/4</span>
        </div>
        <div className="flex gap-2 mb-3">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={[
                "flex-1 h-12 rounded-lg flex items-center justify-center text-xl font-bold transition-colors",
                pin.length === i
                  ? "border-[1.5px] border-[var(--pt-green)]"
                  : "border border-[var(--pt-border-strong)]",
                pin[i] ? "bg-[var(--pt-green-50)]" : "bg-[var(--pt-surface)]",
              ].join(" ")}
            >
              {pin[i] ? "•" : ""}
            </div>
          ))}
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-2">
          {PAD.map((k, i) => {
            if (k === "") return <div key={i} />
            return (
              <button
                key={i}
                type="button"
                onClick={() => onKey(k)}
                className={[
                  "h-12 rounded-lg border border-[var(--pt-border)] bg-[var(--pt-surface)] font-semibold text-[var(--pt-text)]",
                  "hover:bg-[var(--pt-muted)] active:bg-[var(--pt-muted-strong)] transition-colors flex items-center justify-center",
                  k === "del" ? "text-[var(--pt-text-secondary)]" : "text-base",
                ].join(" ")}
              >
                {k === "del" ? <Delete size={18} /> : k}
              </button>
            )
          })}
        </div>
      </div>

      {error && (
        <p className="text-sm text-[var(--pt-red)] bg-[var(--pt-red-50)] px-3 py-2 rounded-lg">
          {error}
        </p>
      )}

      {/* Hidden inputs for form data */}
      <input type="hidden" name="phone" value={phone} />
      <input type="hidden" name="pin" value={pin} />

      <Button
        type="button"
        onClick={handleSubmit}
        disabled={pending || pin.length !== 4 || !phone}
        className="w-full h-11 bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)] text-white font-semibold"
      >
        {pending ? "Signing in…" : "Sign in with PIN"}
      </Button>
    </div>
  )
}
