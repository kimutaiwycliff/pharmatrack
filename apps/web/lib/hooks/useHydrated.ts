import { useSyncExternalStore } from "react"

const noop = () => () => {}

/**
 * False in the server HTML, true once React has hydrated. Credential forms
 * keep Submit disabled until then: clicked earlier, the browser would do a
 * native submit — before our onSubmit exists — and could put the password in
 * the URL (and in proxy logs).
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false)
}
