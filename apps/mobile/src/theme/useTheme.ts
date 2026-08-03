import { useColorScheme } from "react-native"
import { darkTheme, lightTheme, type Theme } from "./tokens"

// Follows the device's system light/dark setting, matching web/desktop's
// "system" appearance option (CLAUDE.md §6.11). A manual light/dark/system
// override toggle (like web's Settings > Appearance) is a follow-up, not
// built here — this covers the common case without extra state/persistence.
export function useTheme(): Theme {
  const scheme = useColorScheme()
  return scheme === "dark" ? darkTheme : lightTheme
}
