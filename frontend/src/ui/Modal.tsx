import { useEffect, useRef, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { AnimatePresence, motion } from "motion/react"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { dialogVariants, fadeVariants, sheetVariants } from "@/ui/motion"

/**
 * Dialog that becomes a bottom sheet on phones.
 *
 * Focus is moved into the panel on open and returned to the trigger on close,
 * and Escape and backdrop clicks both dismiss — the behaviours a native dialog
 * gives for free and that get forgotten in hand-rolled ones.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: "sm" | "md" | "lg"
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    restoreRef.current = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = "hidden"

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose()
        return
      }
      if (event.key !== "Tab" || !panelRef.current) return

      // Trap Tab inside the panel so focus cannot wander onto the page behind
      // the backdrop, which is inert to the mouse but not to the keyboard.
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener("keydown", onKeyDown)
    const timer = window.setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(
        'input:not([type="hidden"]),select,textarea,button',
      )
      target?.focus()
    }, 60)

    return () => {
      document.removeEventListener("keydown", onKeyDown)
      window.clearTimeout(timer)
      document.body.style.overflow = overflow
      restoreRef.current?.focus?.()
    }
  }, [open, onClose])

  const widths = {
    sm: "sm:max-w-[400px]",
    md: "sm:max-w-[520px]",
    lg: "sm:max-w-[720px]",
  }[size]

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            variants={fadeVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            className="absolute inset-0 bg-black/25 backdrop-blur-[2px] dark:bg-black/55"
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            // Sheet from the bottom on phones, centred dialog from tablet up.
            variants={
              typeof window !== "undefined" && window.innerWidth < 640
                ? sheetVariants
                : dialogVariants
            }
            initial="hidden"
            animate="visible"
            exit="exit"
            className={cn(
              "relative flex max-h-[92vh] w-full flex-col overflow-hidden",
              "rounded-t-[24px] sm:rounded-[22px]",
              "border border-[var(--border-subtle)] bg-[var(--bg-elevated)]",
              "shadow-[var(--shadow-lg)]",
              widths,
            )}
          >
            {/* Grab handle — the affordance that says "drag me down". */}
            <div className="flex justify-center pt-2.5 sm:hidden">
              <span className="h-1 w-9 rounded-full bg-[var(--border)]" />
            </div>

            <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-5">
              <div className="min-w-0">
                <h2
                  id="modal-title"
                  className="text-[19px] font-semibold tracking-[-0.02em] text-[var(--text)]"
                >
                  {title}
                </h2>
                {description && (
                  <p className="mt-1 text-[13.5px] text-[var(--text-secondary)]">
                    {description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="-mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-2">
              {children}
            </div>

            {footer && (
              <div className="safe-bottom flex justify-end gap-2 border-t border-[var(--border-subtle)] bg-[var(--surface-2)] px-6 py-4">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
