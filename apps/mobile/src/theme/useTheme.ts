import { useColorScheme } from "react-native"
import { create } from "zustand"
import { kvGetSync, kvSetSync } from "../lib/kv"
import { darkTheme, lightTheme, type Theme } from "./tokens"

// Light / dark / system, matching web's Settings > Appearance (CLAUDE.md
// §6.11). "system" follows the device setting. The choice is persisted in kv
// so it survives restarts; R3 adds the settings screen, the POS overflow menu
// has a toggle meanwhile.
export type ThemeMode = "light" | "dark" | "system"

const KEY = "theme_mode"
const MODES: ThemeMode[] = ["system", "light", "dark"]

interface ThemeModeState {
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
}

function initialMode(): ThemeMode {
  try {
    const saved = kvGetSync<ThemeMode>(KEY)
    return saved && MODES.includes(saved) ? saved : "system"
  } catch {
    return "system"
  }
}

const useThemeModeStore = create<ThemeModeState>((set) => ({
  mode: initialMode(),
  setMode(mode) {
    kvSetSync(KEY, mode)
    set({ mode })
  },
}))

/** Current mode + setter + a cycle helper (system → light → dark). */
export function useThemeMode() {
  const mode = useThemeModeStore((s) => s.mode)
  const setMode = useThemeModeStore((s) => s.setMode)
  const cycle = () => setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]!)
  return { mode, setMode, cycle }
}

/** Resolved scheme after applying the user's override. */
export function useColorSchemeResolved(): "light" | "dark" {
  const system = useColorScheme()
  const mode = useThemeModeStore((s) => s.mode)
  if (mode === "system") return system === "dark" ? "dark" : "light"
  return mode
}

export function useTheme(): Theme {
  return useColorSchemeResolved() === "dark" ? darkTheme : lightTheme
}
