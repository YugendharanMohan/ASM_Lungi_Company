import { useState, type ReactNode } from "react"
import { NavLink, useLocation } from "react-router-dom"
import {
  BarChart3,
  Building2,
  ClipboardList,
  Cog,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Sun,
  Truck,
  Users,
  UserCog,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/AuthContext"
import { cn } from "@/lib/utils"

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/production", label: "Daily Entry", icon: ClipboardList },
  { to: "/workers", label: "Workers", icon: Users },
  { to: "/sheds", label: "Sheds", icon: Building2 },
  { to: "/looms", label: "Looms", icon: Cog },
  { to: "/salary", label: "Salary", icon: BarChart3 },
  { to: "/dispatch", label: "Dispatch", icon: Truck },
]

function useTheme() {
  const [dark, setDark] = useState(
    () =>
      localStorage.getItem("asm-theme") === "dark" ||
      (!localStorage.getItem("asm-theme") &&
        window.matchMedia("(prefers-color-scheme: dark)").matches),
  )

  const toggle = () => {
    setDark((previous) => {
      const next = !previous
      document.documentElement.classList.toggle("dark", next)
      localStorage.setItem("asm-theme", next ? "dark" : "light")
      return next
    })
  }

  // Applied during render rather than in an effect so the first paint already
  // matches the stored preference instead of flashing the light theme.
  document.documentElement.classList.toggle("dark", dark)

  return { dark, toggle }
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, isAdmin, devMode, logout } = useAuth()
  const { dark, toggle } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()

  const nav = isAdmin
    ? [...NAV, { to: "/users", label: "User Access", icon: UserCog }]
    : NAV

  return (
    <div className="min-h-screen bg-background">
      {devMode && (
        <div className="bg-destructive px-4 py-2 text-center text-sm font-medium text-destructive-foreground">
          Development mode — authentication is disabled. Configure Firebase
          before using this with real data.
        </div>
      )}

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-sidebar-border bg-sidebar transition-transform lg:static lg:translate-x-0",
            menuOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary font-bold text-primary-foreground">
              A
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">ASM Lungi Works</p>
              <p className="truncate text-xs text-muted-foreground">
                Production &amp; Wages
              </p>
            </div>
            <button
              onClick={() => setMenuOpen(false)}
              className="ml-auto lg:hidden"
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto p-3">
            {nav.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )
                }
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="border-t border-sidebar-border p-3">
            <div className="mb-2 px-2">
              <p className="truncate text-sm font-medium">
                {user?.display_name || user?.email || "Signed in"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {user?.role === "ADMIN" ? "Administrator" : "Staff"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={toggle}
                className="flex-1"
                aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
              >
                {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void logout()}
                className="flex-1"
              >
                <LogOut className="size-4" />
                Sign out
              </Button>
            </div>
          </div>
        </aside>

        {menuOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setMenuOpen(false)}
          />
        )}

        {/* Main */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 items-center gap-3 border-b px-4 lg:hidden">
            <button onClick={() => setMenuOpen(true)} aria-label="Open menu">
              <Menu className="size-6" />
            </button>
            <span className="font-semibold">
              {nav.find((item) => item.to === location.pathname)?.label ??
                "ASM Lungi Works"}
            </span>
          </header>

          <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
    </div>
  )
}
