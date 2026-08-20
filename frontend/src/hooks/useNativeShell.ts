import { useEffect, useRef } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { App as CapApp } from "@capacitor/app"
import { SplashScreen } from "@capacitor/splash-screen"
import { StatusBar, Style } from "@capacitor/status-bar"

import { isNative } from "@/lib/native"

/**
 * Wires the Android shell to the app: hardware back button, status bar
 * tint, and dismissing the splash screen.
 *
 * A no-op in the browser, so it can be called unconditionally.
 */
export function useNativeShell() {
  const navigate = useNavigate()
  const location = useLocation()

  // The back-button listener is registered once; without a ref it would close
  // over the first location forever and always think it is on the home screen.
  const pathRef = useRef(location.pathname)
  pathRef.current = location.pathname

  useEffect(() => {
    if (!isNative) return

    // React has painted by the time an effect runs, so this is the first
    // moment the splash can go without showing a blank frame.
    void SplashScreen.hide()

    const handle = CapApp.addListener("backButton", () => {
      // An open dialog is what "back" most obviously means, so close that
      // first. Both Modal and the confirm dialog already dismiss on Escape,
      // so this reuses their existing handling instead of duplicating it.
      if (document.querySelector('[role="dialog"]')) {
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        )
        return
      }

      if (pathRef.current !== "/") {
        navigate(-1)
        return
      }

      // On the home screen, back leaves the app — the Android convention.
      // Navigating instead would trap the user with no way out.
      void CapApp.exitApp()
    })

    return () => {
      void handle.then((listener) => listener.remove())
    }
  }, [navigate])

  useEffect(() => {
    if (!isNative) return

    // The status bar sits above the app's own background, so its icons have
    // to invert with the theme or they vanish. Watching the class on <html>
    // keeps this independent of wherever the theme state actually lives.
    const apply = () => {
      const dark = document.documentElement.classList.contains("dark")
      // Style.Dark means dark *content* on a light bar, and vice versa —
      // the naming is the opposite way round to what it reads like.
      void StatusBar.setStyle({ style: dark ? Style.Light : Style.Dark })
    }

    apply()
    const observer = new MutationObserver(apply)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    })
    return () => observer.disconnect()
  }, [])
}
