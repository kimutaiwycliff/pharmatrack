// Mirrors apps/web/app/globals.css's --pt-* CSS variables exactly (both the
// :root/light block and the .dark block) so the mobile app matches the web
// and desktop apps' color system instead of using ad-hoc colors.
export const lightTheme = {
  green: "#16a34a",
  green600: "#15803d",
  greenCta: "#15803d",
  green50: "#f0fdf4",
  green100: "#dcfce7",
  bg: "#f9fafb",
  surface: "#ffffff",
  muted: "#f9fafb",
  mutedStrong: "#f3f4f6",
  border: "#e5e7eb",
  borderStrong: "#d1d5db",
  text: "#111827",
  textSecondary: "#6b7280",
  textTertiary: "#9ca3af",
  red: "#ef4444",
  red50: "#fef2f2",
  amber: "#f59e0b",
  yellow: "#eab308",
  // R2: text/icons on a filled green/red surface, and the dimming layer over
  // the camera — named so new screens never hardcode #fff/#000.
  onAccent: "#ffffff",
  scrim: "rgba(0,0,0,0.55)",
}

export const darkTheme = {
  green: "#22c55e",
  green600: "#16a34a",
  greenCta: "#15803d",
  green50: "#0f2a1b",
  green100: "#173a26",
  bg: "#0e1116",
  surface: "#171b21",
  muted: "#1c212a",
  mutedStrong: "#232a34",
  border: "#2a313b",
  borderStrong: "#3a424d",
  text: "#e6e8eb",
  textSecondary: "#9ba3af",
  textTertiary: "#6b7480",
  red: "#f87171",
  red50: "#2a1517",
  amber: "#fbbf24",
  yellow: "#facc15",
  onAccent: "#ffffff",
  scrim: "rgba(0,0,0,0.65)",
}

export type Theme = typeof lightTheme

// ── Layout + type scale (R2 design system) ──────────────────────────────────
// Color stays per-theme above; everything below is theme-independent, so
// components import these directly instead of going through useTheme().

/** 4-pt spacing scale. */
export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const

type Weight = "400" | "500" | "600" | "700" | "800"
interface TypeStyle {
  fontSize: number
  lineHeight: number
  fontWeight: Weight
}

/** Type scale used by <Text variant=…>. Body is 16 so till text reads at arm's length. */
export const typography: Record<"display" | "title" | "headline" | "body" | "bodyStrong" | "label" | "caption", TypeStyle> = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: "800" },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
  headline: { fontSize: 18, lineHeight: 24, fontWeight: "600" },
  body: { fontSize: 16, lineHeight: 22, fontWeight: "400" },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: "600" },
  label: { fontSize: 14, lineHeight: 18, fontWeight: "600" },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
}

export type TypeVariant = keyof typeof typography

/** Android elevation + iOS shadow pairs. */
export const elevation = {
  none: {},
  sm: { elevation: 2, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  md: { elevation: 6, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
  lg: { elevation: 12, shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 18, shadowOffset: { width: 0, height: 6 } },
} as const

/** Minimum touch target (Material 48dp) — every new touchable meets this. */
export const TOUCH_TARGET = 48

/** Width at which the POS switches to the tablet split view. */
export const TABLET_MIN_WIDTH = 768
