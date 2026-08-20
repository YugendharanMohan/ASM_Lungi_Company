import type { CapacitorConfig } from "@capacitor/cli"

const config: CapacitorConfig = {
  appId: "com.asmlungi.app",
  appName: "ASM",
  // The built web app is copied into the native project, so the APK works
  // without a dev server. Run `npm run build` before `npx cap sync`.
  webDir: "dist",

  android: {
    // The WebView's page origin, and therefore the Origin header the API
    // sees on every request. Pinned to https so it stays a secure context —
    // Firebase Auth refuses to persist a session otherwise — and so the
    // value the backend must allow in CORS_ORIGINS is stable and documented
    // rather than whatever the default happens to be in a future release.
    //
    // Whatever is set here MUST appear in the backend's CORS_ORIGINS, or
    // every request fails and the app reports it as the server being down.
    androidScheme: "https",
  },

  plugins: {
    SplashScreen: {
      // Short, and dismissed from JS once React has painted, so the splash
      // never outlives the app being ready — nor disappears before it.
      launchAutoHide: false,
      backgroundColor: "#F5F5F7",
      androidScaleType: "CENTER_CROP",
    },
    Keyboard: {
      // The daily entry form is mostly numeric fields near the bottom of the
      // screen; without this the keyboard covers the one being typed into.
      resize: "body" as never,
    },
  },
}

export default config
