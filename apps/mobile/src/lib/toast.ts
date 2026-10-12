import { useToastStore, type ToastAction } from "../store/toast"

// Imperative toast API usable from anywhere — React components AND plain
// modules like store/cart.ts — mirroring how apps/web/lib/store/cartStore.ts
// calls sonner's toast.error(...) directly from inside a zustand action.
// Optional `action` adds a button (e.g. Undo) — the toast stays up longer.
export const toast = {
  success: (message: string, opts?: { action?: ToastAction }) => useToastStore.getState().show(message, "success", opts?.action),
  error: (message: string, opts?: { action?: ToastAction }) => useToastStore.getState().show(message, "error", opts?.action),
  info: (message: string, opts?: { action?: ToastAction }) => useToastStore.getState().show(message, "info", opts?.action),
  dismiss: (id: number) => useToastStore.getState().dismiss(id),
}
