import type { ExpoConfig } from "expo/config"

// ADR-013 — Android app config. Using app.config.ts instead of app.json so the
// New Architecture opt-out below can carry a comment explaining why, and so
// bundle identifiers/scheme live in one typed place.
const BUNDLE_ID = "co.ke.pharmatrack.mobile"

const config: ExpoConfig = {
  name: "PharmaTrack",
  slug: "pharmatrack-mobile",
  version: "1.0.0",
  scheme: "pharmatrack",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  // Note: there is no New Architecture opt-out on this Expo SDK/RN version —
  // RN 0.82+ removed the Legacy Architecture entirely, so `newArchEnabled` is
  // not a valid config field. WatermelonDB's Android JSI module only works
  // under the New Architecture via a third-party beta config plugin (see
  // `@morrowdigital/watermelondb-expo-plugin` below and ADR-013) — accepted
  // as a known, documented risk rather than a silent assumption.
  ios: {
    supportsTablet: true,
    bundleIdentifier: BUNDLE_ID,
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
    // Camera for GS1/barcode product lookup; Bluetooth for a future ESC-POS
    // thermal printer integration (deferred per ADR-013 — no printer library
    // wired up yet, but the permission is harmless to declare now).
    permissions: ["CAMERA", "BLUETOOTH", "BLUETOOTH_ADMIN", "BLUETOOTH_CONNECT"],
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  extra: {
    eas: {
      projectId: "1e6c2a1b-3273-42ab-8ff6-aa0f1ff5295b",
    },
  },
  plugins: [
    "expo-router",
    [
      "expo-camera",
      {
        cameraPermission: "PharmaTrack needs camera access to scan product barcodes.",
      },
    ],
    // Patches the generated Android native project to register
    // WatermelonDBJSIPackage via getPackages() — the current (post RN-0.74)
    // registration method per WatermelonDB's own changelog. Third-party beta
    // plugin, pinned to an exact version in package.json — see ADR-013.
    "@morrowdigital/watermelondb-expo-plugin",
    // Required by @better-auth/expo's client for its (unused by us) OAuth
    // browser-redirect path; harmless to include even though PharmaTrack
    // mobile only uses email/password + PIN login.
    "expo-web-browser",
  ],
}

export default config
