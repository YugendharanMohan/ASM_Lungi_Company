import { lazy, Suspense } from "react"
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { Toaster } from "sonner"

import { AppShell } from "@/components/AppShell"
import { useNativeShell } from "@/hooks/useNativeShell"
import { ConfirmProvider } from "@/ui/ConfirmDialog"
import { AuthProvider, useAuth } from "@/contexts/AuthContext"
import { ThemeProvider } from "@/contexts/ThemeContext"
import { AccessDenied } from "@/pages/AccessDenied"
import { Login } from "@/pages/Login"
import { VerifyEmail } from "@/pages/VerifyEmail"

// Feature screens are split out of the entry bundle. The charting library
// alone is a few hundred kB and none of it is needed to render the login
// screen — the only thing a signed-out visitor ever sees.
const Overview = lazy(() =>
  import("@/pages/Overview").then((m) => ({ default: m.Overview })),
)
const DispatchPage = lazy(() =>
  import("@/pages/DispatchPage").then((m) => ({ default: m.DispatchPage })),
)
const Looms = lazy(() =>
  import("@/pages/Looms").then((m) => ({ default: m.Looms })),
)
const Production = lazy(() =>
  import("@/pages/Production").then((m) => ({ default: m.Production })),
)
const Salary = lazy(() =>
  import("@/pages/Salary").then((m) => ({ default: m.Salary })),
)
const Sheds = lazy(() =>
  import("@/pages/Sheds").then((m) => ({ default: m.Sheds })),
)
const UserAccess = lazy(() =>
  import("@/pages/UserAccess").then((m) => ({ default: m.UserAccess })),
)
const Workers = lazy(() =>
  import("@/pages/Workers").then((m) => ({ default: m.Workers })),
)

function Spinner({ full = false }: { full?: boolean }) {
  return (
    <div
      className={
        full
          ? "flex min-h-dvh items-center justify-center bg-[var(--bg)]"
          : "flex items-center justify-center py-24"
      }
    >
      <Loader2 className="size-5 animate-spin text-[var(--text-tertiary)]" />
    </div>
  )
}

/**
 * The whole app is behind auth, so the gate lives here rather than on each
 * route. Every non-signed-in state gets its own screen, because "please sign
 * in" is unhelpful when the real problem is an unverified address.
 */
function AuthGate() {
  const { status, isAdmin } = useAuth()
  // No-op in the browser; wires the Android back button, status bar
  // and splash screen when running in the APK.
  useNativeShell()

  if (status === "loading") return <Spinner full />
  if (status === "signed-out") return <Login />
  if (status === "unverified") return <VerifyEmail />
  if (status === "denied") return <AccessDenied />

  return (
    <Routes>
      <Route
        element={
          // ConfirmProvider sits inside the shell so its dialog renders above
          // the app chrome and every screen can reach useConfirm().
          <ConfirmProvider>
            <AppShell>
              <Suspense fallback={<Spinner />}>
                <Outlet />
              </Suspense>
            </AppShell>
          </ConfirmProvider>
        }
      >
        <Route index element={<Overview />} />
        <Route path="production" element={<Production />} />
        <Route path="workers" element={<Workers />} />
        <Route path="sheds" element={<Sheds />} />
        <Route path="looms" element={<Looms />} />
        <Route path="salary" element={<Salary />} />
        <Route path="dispatch" element={<DispatchPage />} />
        <Route
          path="users"
          element={isAdmin ? <UserAccess /> : <Navigate to="/" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <AuthGate />
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: "var(--glass)",
                backdropFilter: "saturate(180%) blur(20px)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "14px",
                color: "var(--text)",
                boxShadow: "var(--shadow-md)",
                fontSize: "13.5px",
              },
            }}
          />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
