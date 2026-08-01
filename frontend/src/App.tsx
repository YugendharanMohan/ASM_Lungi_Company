import { lazy, Suspense } from "react"
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom"
import { Loader2 } from "lucide-react"

import { AppLayout } from "@/components/AppLayout"
import { Toaster } from "@/components/ui/sonner"
import { AuthProvider, useAuth } from "@/contexts/AuthContext"
import { AccessDenied } from "@/pages/AccessDenied"
import { Login } from "@/pages/Login"
import { VerifyEmail } from "@/pages/VerifyEmail"

// Feature screens are split out of the entry bundle. The charting library
// alone is a few hundred kB, and none of it is needed to render the login
// screen — which is the only thing a signed-out visitor ever sees.
const Dashboard = lazy(() =>
  import("@/pages/Dashboard").then((m) => ({ default: m.Dashboard })),
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

function FullPageSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
    </div>
  )
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
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

  if (status === "loading") return <FullPageSpinner />
  if (status === "signed-out") return <Login />
  if (status === "unverified") return <VerifyEmail />
  if (status === "denied") return <AccessDenied />

  return (
    <Routes>
      {/* Suspense sits inside the layout so the sidebar stays put while a
          lazily-loaded screen arrives, instead of the page blanking. */}
      <Route
        element={
          <AppLayout>
            <Suspense fallback={<Loading />}>
              <Outlet />
            </Suspense>
          </AppLayout>
        }
      >
        <Route index element={<Dashboard />} />
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
    <AuthProvider>
      <BrowserRouter>
        <AuthGate />
        <Toaster richColors position="top-right" />
      </BrowserRouter>
    </AuthProvider>
  )
}
