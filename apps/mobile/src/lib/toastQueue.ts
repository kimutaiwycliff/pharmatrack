// Pure toast-queue rules (vitest-tested), used by src/store/toast.ts:
//  - at most MAX_TOASTS on screen; a new one pushes out the oldest;
//  - the same message + variant while it's still showing is collapsed into
//    the existing toast with a count ("Added Panadol ×3" while scanning)
//    instead of stacking copies;
//  - a toast with an action (Undo) is never collapsed — each undo is distinct.

export type ToastVariant = "success" | "error" | "info"

export interface ToastAction {
  label: string
  onPress: () => void
}

export interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
  /** How many identical toasts this one stands for (1 = just itself). */
  count: number
  action?: ToastAction
}

export interface ToastInput {
  message: string
  variant: ToastVariant
  action?: ToastAction
}

export const MAX_TOASTS = 3

export interface PushResult {
  toasts: ToastItem[]
  /** The toast now showing this message (new or collapsed into). */
  id: number
  /** True when it was merged into an existing toast. */
  collapsed: boolean
  /** Toasts pushed out by the cap (their timers can be cleared). */
  dropped: number[]
}

export function pushToast(toasts: ToastItem[], input: ToastInput, newId: number, max = MAX_TOASTS): PushResult {
  if (!input.action) {
    const same = toasts.find((t) => !t.action && t.message === input.message && t.variant === input.variant)
    if (same) {
      // Move it to the newest slot so the bump is where the eye already is.
      const bumped: ToastItem = { ...same, count: same.count + 1 }
      return { toasts: [...toasts.filter((t) => t.id !== same.id), bumped], id: same.id, collapsed: true, dropped: [] }
    }
  }
  const next = [...toasts, { id: newId, message: input.message, variant: input.variant, count: 1, action: input.action }]
  const overflow = Math.max(0, next.length - max)
  return { toasts: next.slice(overflow), id: newId, collapsed: false, dropped: next.slice(0, overflow).map((t) => t.id) }
}

export function dismissToast(toasts: ToastItem[], id: number): ToastItem[] {
  return toasts.filter((t) => t.id !== id)
}

/** What the toast shows: "Added Panadol" → "Added Panadol ×3". */
export const toastLabel = (t: Pick<ToastItem, "message" | "count">): string => (t.count > 1 ? `${t.message} ×${t.count}` : t.message)

/** Toasts with an action stay up longer so there's time to reach Undo. */
export const toastDurationMs = (t: Pick<ToastItem, "action" | "variant">): number => (t.action ? 5000 : t.variant === "error" ? 4000 : 3000)
