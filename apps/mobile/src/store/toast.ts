import { create } from "zustand"
import { dismissToast, pushToast, toastDurationMs, type ToastAction, type ToastItem, type ToastVariant } from "../lib/toastQueue"

export type { ToastAction, ToastItem, ToastVariant } from "../lib/toastQueue"

interface ToastState {
  toasts: ToastItem[]
  show: (message: string, variant: ToastVariant, action?: ToastAction) => number
  dismiss: (id: number) => void
}

let nextId = 1
const timers = new Map<number, ReturnType<typeof setTimeout>>()

function clearTimer(id: number) {
  const t = timers.get(id)
  if (t) clearTimeout(t)
  timers.delete(id)
}

// Backs the imperative toast.success/error/info() API in ../lib/toast.ts —
// mirrors apps/web/lib/store/cartStore.ts calling sonner's toast.error(...)
// directly from inside a zustand action, not just from React components.
// Queue rules (cap 3, duplicate collapse "×3") live in lib/toastQueue.ts; a
// collapsed toast's timer restarts so it stays up while scanning continues.
export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show(message, variant, action) {
    const r = pushToast(get().toasts, { message, variant, action }, nextId++)
    set({ toasts: r.toasts })
    r.dropped.forEach(clearTimer)
    clearTimer(r.id)
    const item = r.toasts.find((t) => t.id === r.id)
    timers.set(
      r.id,
      setTimeout(() => get().dismiss(r.id), item ? toastDurationMs(item) : 3000),
    )
    return r.id
  },
  dismiss(id) {
    clearTimer(id)
    set((state) => ({ toasts: dismissToast(state.toasts, id) }))
  },
}))
