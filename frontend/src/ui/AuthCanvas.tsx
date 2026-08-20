import type { ReactNode } from "react"
import { motion } from "motion/react"

import { Logo } from "@/ui/Logo"

/**
 * The shell every signed-out screen sits in.
 *
 * A single soft radial wash behind a glass card — the one place in the app
 * that gets any decoration, because it is the only screen with nothing to
 * read. Everything past sign-in is a working surface and stays flat.
 */
export function AuthCanvas({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string
  subtitle?: string
  icon?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-[var(--bg)] px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 size-[620px] -translate-x-1/2 -translate-y-1/3 rounded-full opacity-[0.18] blur-[100px]"
        style={{ background: "var(--accent)" }}
      />

      <motion.div
        initial={{ opacity: 0, y: 14, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="glass relative w-full max-w-[420px] rounded-[24px] border p-7 shadow-[var(--shadow-lg)] sm:p-9"
      >
        <div className="mb-7 text-center">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto mb-4 w-fit"
          >
            {/* Sign-in shows the company mark; the verify and access-denied
                screens pass their own icon, which stays on the accent tile
                because a white glyph needs a coloured ground. */}
            {icon ? (
              <span className="flex size-12 items-center justify-center rounded-[15px] bg-[var(--accent)] text-[19px] font-semibold text-white shadow-[var(--shadow-md)]">
                {icon}
              </span>
            ) : (
              <Logo className="size-20 shadow-[var(--shadow-md)]" />
            )}
          </motion.div>
          <h1 className="text-[24px] font-semibold tracking-[-0.025em] text-[var(--text)]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 text-[14px] text-[var(--text-secondary)]">
              {subtitle}
            </p>
          )}
        </div>

        <div className="space-y-4">{children}</div>
      </motion.div>
    </div>
  )
}
