import { useEffect, useState, type ReactNode } from "react"
import { NavLink, useLocation } from "react-router-dom"
import { AnimatePresence, motion } from "motion/react"
import {
  BarChart3,
  Building2,
  ClipboardList,
  Cog,
  LayoutGrid,
  LogOut,
  Moon,
  MoreHorizontal,
  Sun,
  Truck,
  UserCog,
  Users,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { useAuth } from "@/contexts/AuthContext"
import { cn } from "@/lib/utils"
import { pageVariants } from "@/ui/motion"

interface NavItem {
  to: string
  label: string
  short: string
  icon: LucideIcon
  end?: boolean
}

const NAV: NavItem[] = [
  { to: "/", label: "Overview", short: "Overview", icon: LayoutGrid, end: true },
  { to: "/production", label: "Daily Entry", short: "Entry", icon: ClipboardList },
  { to: "/workers", label: "Workers", short: "Workers", icon: Users },
  { to: "/salary", label: "Salary", short: "Salary", icon: BarChart3 },
  { to: "/dispatch", label: "Dispatch", short: "Dispatch", icon: Truck },
  { to: "/sheds", label: "Sheds", short: "Sheds", icon: Building2 },
  { to: "/looms", label: "Looms", short: "Looms", icon: Cog },
]

/** Only five fit a phone tab bar before the labels start truncating. */
const MOBILE_PRIMARY = 4

function useTheme() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem("asm-theme")
    if (stored) return stored === "dark"
    return window.matchMedia("(prefers-color-scheme: dark)").matches
  })

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark)
    localStorage.setItem("asm-theme", dark ? "dark" : "light")
  }, [dark])

  return { dark, toggle: () => setDark((value) => !value) }
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, isAdmin, devMode, logout } = useAuth()
  const { dark, toggle } = useTheme()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)

  const nav = isAdmin
    ? [
      ...NAV,
      { to: "/users", label: "User Access", short: "Access", icon: UserCog },
    ]
    : NAV

  const primary = nav.slice(0, MOBILE_PRIMARY)
  const overflow = nav.slice(MOBILE_PRIMARY)
  const current = nav.find((item) =>
    item.end ? location.pathname === item.to : location.pathname === item.to,
  )

  useEffect(() => setMoreOpen(false), [location.pathname])

  return (
    <div className="min-h-dvh bg-[var(--bg)]">
      {devMode && (
        <div className="relative z-50 bg-[var(--danger)] px-4 py-1.5 text-center text-[12.5px] font-medium text-white">
          Development mode — authentication is disabled
        </div>
      )}

      {/* ---------------- Desktop sidebar ---------------- */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col lg:flex",
          "border-r border-[var(--border-subtle)] bg-[var(--surface)]",
          devMode && "top-[30px]",
        )}
      >
        <div className="flex items-center gap-3 px-5 pb-2 pt-6">
          <div className="flex size-9 items-center justify-center rounded-[11px] bg-[var(--accent)] text-[15px] font-semibold text-white">
            A
          </div>
          <div className="min-w-0">
            <p className="truncate text-[14px] font-semibold tracking-[-0.01em]">
              ASM Lungi Company
            </p>
            <p className="truncate text-[11.5px] text-[var(--text-tertiary)]">
              Production &amp; wages
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3 pt-5">
          {nav.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
        </nav>

        <div className="border-t border-[var(--border-subtle)] p-3">
          <div className="mb-2 px-2">
            <p className="truncate text-[13px] font-medium">
              {user?.display_name || user?.email || "Signed in"}
            </p>
            <p className="truncate text-[11.5px] text-[var(--text-tertiary)]">
              {user?.role === "ADMIN" ? "Administrator" : "Staff"}
            </p>
          </div>
          <div className="flex gap-1.5">
            <ShellButton
              onClick={toggle}
              label={dark ? "Switch to light theme" : "Switch to dark theme"}
            >
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </ShellButton>
            <ShellButton onClick={() => void logout()} label="Sign out" grow>
              <LogOut className="size-4" />
              <span className="text-[13px]">Sign out</span>
            </ShellButton>
          </div>
        </div>
      </aside>

      {/* ---------------- Mobile top bar ---------------- */}
      <header
        className={cn(
          "glass sticky top-0 z-40 flex h-14 items-center gap-3 border-b px-4 lg:hidden",
          devMode && "top-[30px]",
        )}
      >
        <div className="flex size-7 items-center justify-center rounded-[9px] bg-[var(--accent)] text-[12px] font-semibold text-white">
          A
        </div>
        <p className="flex-1 truncate text-[15px] font-semibold tracking-[-0.01em]">
          {current?.label ?? "ASM Lungi Compamy"}
        </p>
        <button
          type="button"
          onClick={toggle}
          aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
          className="flex size-8 items-center justify-center rounded-full text-[var(--text-secondary)]"
        >
          {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>
      </header>

      {/* ---------------- Content ---------------- */}
      <main className="pb-24 lg:ml-[248px] lg:pb-0">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-7 sm:py-9">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              variants={pageVariants}
              initial="hidden"
              animate="visible"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* ---------------- Mobile tab bar ---------------- */}
      <nav className="glass safe-bottom fixed inset-x-0 bottom-0 z-40 border-t lg:hidden">
        <div className="flex items-stretch justify-around px-1 pt-1.5">
          {primary.map((item) => (
            <TabLink key={item.to} item={item} />
          ))}
          {overflow.length > 0 && (
            <button
              type="button"
              onClick={() => setMoreOpen((value) => !value)}
              aria-expanded={moreOpen}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[10px] px-1 pb-2 pt-1",
                moreOpen
                  ? "text-[var(--accent)]"
                  : "text-[var(--text-tertiary)]",
              )}
            >
              <MoreHorizontal className="size-[22px]" strokeWidth={2} />
              <span className="text-[10.5px] font-medium">More</span>
            </button>
          )}
        </div>

        <AnimatePresence>
          {moreOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden border-t border-[var(--border-subtle)]"
            >
              <div className="grid grid-cols-4 gap-1 p-2">
                {overflow.map((item) => (
                  <TabLink key={item.to} item={item} />
                ))}
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="flex min-w-0 flex-col items-center gap-1 rounded-[10px] px-1 py-2 text-[var(--text-tertiary)]"
                >
                  <LogOut className="size-[22px]" strokeWidth={2} />
                  <span className="text-[10.5px] font-medium">Sign out</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </div>
  )
}

function SidebarLink({ item }: { item: NavItem }) {
  const { to, label, icon: Icon, end } = item
  return (
    <NavLink to={to} end={end}>
      {({ isActive }) => (
        <span
          className={cn(
            "relative flex items-center gap-3 rounded-[10px] px-3 py-2 text-[13.5px] font-medium",
            "transition-colors duration-200",
            isActive
              ? "text-[var(--accent)]"
              : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]",
          )}
        >
          {isActive && (
            <motion.span
              layoutId="sidebar-active"
              transition={{ type: "spring", stiffness: 420, damping: 36 }}
              className="absolute inset-0 -z-10 rounded-[10px] bg-[var(--accent-soft)]"
            />
          )}
          <Icon className="size-[17px] shrink-0" strokeWidth={2} />
          {label}
        </span>
      )}
    </NavLink>
  )
}

function TabLink({ item }: { item: NavItem }) {
  const { to, short, icon: Icon, end } = item
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[10px] px-1 pb-2 pt-1 transition-colors",
          isActive ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]",
        )
      }
    >
      {({ isActive }) => (
        <>
          <motion.span
            animate={{ scale: isActive ? 1.06 : 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 28 }}
          >
            <Icon className="size-[22px]" strokeWidth={isActive ? 2.3 : 2} />
          </motion.span>
          <span className="truncate text-[10.5px] font-medium">{short}</span>
        </>
      )}
    </NavLink>
  )
}

function ShellButton({
  children,
  onClick,
  label,
  grow,
}: {
  children: ReactNode
  onClick: () => void
  label: string
  grow?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        "flex h-9 items-center justify-center gap-2 rounded-[10px]",
        "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)]",
        "transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]",
        grow ? "flex-1" : "w-9",
      )}
    >
      {children}
    </button>
  )
}
