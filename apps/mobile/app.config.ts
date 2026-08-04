import type { ExpoConfig } from "expo/config"

// ADR-013 — Android app config. Using app.config.ts instead of app.json so
// bundle identifiers/scheme live in one typed place with room for comments.
const BUNDLE_ID = "co.ke.pharmatrack.mobile"

const config: ExpoConfig = {
  name: "PharmaTrack",
  slug: "pharmatrack-mobile",
  version: "1.0.0",
  scheme: "pharmatrack",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  ios: {
    supportsTablet: true,
    bundleIdentifier: BUNDLE_ID,
  },
  android: {
    package: BUNDLE_ID,
    adaptiveIcon: {
      // Fallback only — backgroundImage (the actual green gradient) takes
      // precedence wherever the launcher supports it. Matches the brand mark.
      backgroundColor: "#15803d",
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
    "expo-sqlite",
    // Required by @better-auth/expo's client for its (unused by us) OAuth
    // browser-redirect path; harmless to include even though PharmaTrack
    // mobile only uses email/password + PIN login.
    "expo-web-browser",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        // Matches src/theme/tokens.ts's light/dark `bg` exactly.
        backgroundColor: "#f9fafb",
        dark: {
          image: "./assets/splash-icon.png",
          backgroundColor: "#0e1116",
        },
      },
    ],
    [
      "expo-build-properties",
      {
        android: {
          enableProguardInReleaseBuilds: true,
          enableShrinkResourcesInReleaseBuilds: true,
        },
      },
    ],
  ],
}

export default config
