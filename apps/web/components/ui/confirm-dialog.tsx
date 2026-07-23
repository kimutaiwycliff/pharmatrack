"use client"

import { createContext, useCallback, useContext, useRef, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface ConfirmOptions {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button for irreversible/destructive actions (default true). */
  destructive?: boolean
}

type ConfirmFn = (message: string, options?: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

/** Promise-based replacement for window.confirm() — styled like the sign-out dialog. */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error("useConfirm must be used within a ConfirmProvider")
  return ctx
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ message: string; options?: ConfirmOptions } | null>(null)
  const resolverRef = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((message, options) => {
    setState({ message, options })
    return new Promise<boolean>((resolve) => { resolverRef.current = resolve })
  }, [])

  function settle(result: boolean) {
    setState(null)
    resolverRef.current?.(result)
    resolverRef.current = null
  }

  const destructive = state?.options?.destructive ?? true

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={!!state} onOpenChange={(o) => !o && settle(false)}>
        <DialogContent className="max-w-sm p-6">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={17} className={destructive ? "text-[var(--pt-red)]" : "text-[var(--pt-text-secondary)]"} />
            <h2 className="text-lg font-bold">{state?.options?.title ?? "Are you sure?"}</h2>
          </div>
          <p className="text-sm text-[var(--pt-text-secondary)] mb-5">{state?.message}</p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => settle(false)}>
              {state?.options?.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              className={`flex-1 text-white ${destructive ? "bg-[var(--pt-red)] hover:opacity-90" : "bg-[var(--pt-green)] hover:bg-[var(--pt-green-600)]"}`}
              onClick={() => settle(true)}
            >
              {state?.options?.confirmLabel ?? "Confirm"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  )
}
