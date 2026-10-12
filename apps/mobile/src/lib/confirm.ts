import { create } from "zustand"

// Promise-based replacement for Alert.alert confirmations, rendered by the
// themed <ConfirmHost/> (components/ConfirmSheet.tsx) mounted once in the
// root layout. Usable from components and plain modules alike:
//
//   if (await confirm({ title: "Delete draft?", message: "…", confirmLabel: "Delete", destructive: true })) { … }
//
// Resolves true only when the confirm button is pressed; Cancel, the
// backdrop, swipe-down and Android back all resolve false. Asking again while
// a dialog is open answers the older one "no" and shows the new one.

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel: string
  cancelLabel?: string
  /** Red confirm button + warning haptic on open. Cancel stays the default. */
  destructive?: boolean
}

export interface ConfirmRequest extends ConfirmOptions {
  id: number
}

interface ConfirmState {
  request: ConfirmRequest | null
  ask: (opts: ConfirmOptions) => Promise<boolean>
  answer: (id: number, ok: boolean) => void
}

let nextId = 1
const resolvers = new Map<number, (ok: boolean) => void>()

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  request: null,
  ask(opts) {
    const previous = get().request
    if (previous) get().answer(previous.id, false)
    const id = nextId++
    return new Promise<boolean>((resolve) => {
      resolvers.set(id, resolve)
      set({ request: { ...opts, id } })
    })
  },
  answer(id, ok) {
    const resolve = resolvers.get(id)
    resolvers.delete(id)
    if (get().request?.id === id) set({ request: null })
    resolve?.(ok)
  },
}))

export const confirm = (opts: ConfirmOptions): Promise<boolean> => useConfirmStore.getState().ask(opts)
