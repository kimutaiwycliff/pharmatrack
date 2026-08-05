import { create } from "zustand"

export type ToastVariant = "success" | "error" | "info"

interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
}

interface ToastState {
  toasts: ToastItem[]
  show: (message: string, variant: ToastVariant) => void
  dismiss: (id: number) => void
}

let nextId = 1
const AUTO_DISMISS_MS = 3000

// Backs the imperative toast.success/error/info() API in ../lib/toast.ts —
// mirrors apps/web/lib/store/cartStore.ts calling sonner's toast.error(...)
// directly from inside a zustand action, not just from React components.
export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show(message, variant) {
    const id = nextId++
    set((state) => ({ toasts: [...state.toasts, { id, message, variant }] }))
    setTimeout(() => get().dismiss(id), AUTO_DISMISS_MS)
  },
  dismiss(id) {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
  },
}))
