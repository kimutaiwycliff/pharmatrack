import { useEffect, useState } from "react"

// Search boxes type fast; only query once the user pauses. setState happens in
// the timer callback (never synchronously in the effect body).
export function useDebouncedValue<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}
