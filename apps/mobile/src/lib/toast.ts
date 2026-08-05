import { useToastStore } from "../store/toast"

// Imperative toast API usable from anywhere — React components AND plain
// modules like store/cart.ts — mirroring how apps/web/lib/store/cartStore.ts
// calls sonner's toast.error(...) directly from inside a zustand action.
export const toast = {
  success: (message: string) => useToastStore.getState().show(message, "success"),
  error: (message: string) => useToastStore.getState().show(message, "error"),
  info: (message: string) => useToastStore.getState().show(message, "info"),
}
