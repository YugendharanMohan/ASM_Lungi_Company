import { Capacitor } from "@capacitor/core"

/**
 * True when running inside the Android shell rather than a browser tab.
 *
 * Read once at module load: the platform cannot change during a session, and
 * calling into the bridge on every render is wasteful.
 */
export const isNative = Capacitor.isNativePlatform()
