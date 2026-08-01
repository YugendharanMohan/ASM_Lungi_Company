import type { ReactNode } from "react"
import { AnimatePresence, motion } from "motion/react"
import { AlertCircle } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * The chrome every form control shares: rounded surface, focus ring, floating
 * label, inline error.
 *
 * The label float is pure CSS via `peer-placeholder-shown`, so the control
 * passed in must carry the `peer` class and a single-space placeholder. Doing
 * it in JS would need focus and value state in every caller and would drop out
 * of sync with browser autofill, which sets values without firing React events.
 */
export function FieldShell({
  id,
  label,
  icon,
  error,
  hint,
  trailing,
  hasIcon,
  className,
  children,
}: {
  id: string
  label: string
  icon?: ReactNode
  error?: string
  hint?: string
  trailing?: ReactNode
  hasIcon?: boolean
  className?: string
  children: ReactNode
}) {
  const withIcon = hasIcon ?? Boolean(icon)

  return (
    <div className={cn("w-full", className)}>
      <div
        className={cn(
          "group relative rounded-[14px] border bg-[var(--surface)]",
          "transition-[border-color,box-shadow] duration-200",
          "shadow-[var(--shadow-sm)]",
          error
            ? "border-[var(--danger)] focus-within:shadow-[0_0_0_3.5px_var(--danger-soft)]"
            : "border-[var(--border)] focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3.5px_var(--ring)]",
        )}
      >
        {icon && (
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2",
              "text-[var(--text-tertiary)] transition-colors duration-200",
              "group-focus-within:text-[var(--accent)]",
              error && "text-[var(--danger)]",
            )}
          >
            {icon}
          </span>
        )}

        {children}

        <label
          htmlFor={id}
          className={cn(
            "pointer-events-none absolute select-none text-[var(--text-tertiary)]",
            "origin-left transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]",
            withIcon ? "left-11" : "left-4",
            "top-1/2 -translate-y-1/2 text-[15px]",
            "peer-focus:top-[9px] peer-focus:translate-y-0 peer-focus:text-[11.5px] peer-focus:font-semibold peer-focus:text-[var(--accent)]",
            "peer-[:not(:placeholder-shown)]:top-[9px] peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-[11.5px] peer-[:not(:placeholder-shown)]:font-semibold",
            // Selects and date inputs never report :placeholder-shown, so they
            // opt in with data-filled instead of relying on the placeholder.
            "peer-data-[filled=true]:top-[9px] peer-data-[filled=true]:translate-y-0 peer-data-[filled=true]:text-[11.5px] peer-data-[filled=true]:font-semibold",
            error && "peer-focus:text-[var(--danger)]",
          )}
        >
          {label}
        </label>

        {trailing && (
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]">
            {trailing}
          </span>
        )}
      </div>

      <AnimatePresence mode="wait">
        {error ? (
          <motion.p
            key="error"
            id={`${id}-error`}
            role="alert"
            initial={{ opacity: 0, height: 0, marginTop: 0 }}
            animate={{ opacity: 1, height: "auto", marginTop: 6 }}
            exit={{ opacity: 0, height: 0, marginTop: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-1.5 overflow-hidden pl-1 text-[12.5px] text-[var(--danger)]"
          >
            <AlertCircle className="size-3.5 shrink-0" />
            {error}
          </motion.p>
        ) : hint ? (
          <p
            key="hint"
            id={`${id}-hint`}
            className="mt-1.5 pl-1 text-[12.5px] text-[var(--text-tertiary)]"
          >
            {hint}
          </p>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/** Shared control classes so every field has one baseline geometry. */
export function controlClasses(opts: {
  hasIcon?: boolean
  hasTrailing?: boolean
}) {
  return cn(
    "peer h-[58px] w-full rounded-[14px] bg-transparent text-[15px] font-medium",
    "text-[var(--text)] outline-none",
    "pb-2 pt-6",
    opts.hasIcon ? "pl-11" : "pl-4",
    opts.hasTrailing ? "pr-11" : "pr-4",
  )
}

export function describedBy(id: string, error?: string, hint?: string) {
  if (error) return `${id}-error`
  if (hint) return `${id}-hint`
  return undefined
}
