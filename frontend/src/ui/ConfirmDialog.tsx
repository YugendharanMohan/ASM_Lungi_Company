import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { AlertTriangle } from "lucide-react"

import { Button } from "@/ui/Button"
import { Modal } from "@/ui/Modal"
import { cn } from "@/lib/utils"

export interface ConfirmOptions {
  title: string
  /** Consequence of going ahead. Skip it when the title says everything. */
  message?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: "danger" | "neutral"
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<Confirm | null>(null)

/**
 * Replaces window.confirm.
 *
 * The browser's dialog cannot be styled, ignores the app's theme, and on a
 * phone appears clamped to the top of the screen looking like a security
 * warning rather than part of the app — which is the worst possible framing
 * for "are you sure you want to delete this".
 *
 * The API stays promise-based so call sites read the same as the thing they
 * replace: `if (!(await confirm({...}))) return`.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<Confirm>((next) => {
    setOptions(next)
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
    })
  }, [])

  const settle = useCallback((result: boolean) => {
    setOptions(null)
    // Every path through here resolves, including Escape and the backdrop.
    // A dismissal that resolved nothing would leave the caller awaiting
    // forever, holding whatever it was doing open with no way back.
    resolveRef.current?.(result)
    resolveRef.current = null
  }, [])

  const danger = options?.tone !== "neutral"

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={options !== null}
        onClose={() => settle(false)}
        title={options?.title ?? ""}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => settle(false)}>
              {options?.cancelLabel ?? "Cancel"}
            </Button>
            <Button
              variant={danger ? "destructive" : "primary"}
              onClick={() => settle(true)}
            >
              {options?.confirmLabel ?? "Delete"}
            </Button>
          </>
        }
      >
        <div className="flex gap-3.5 pb-2">
          <span
            aria-hidden
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full",
              danger
                ? "bg-[var(--danger-soft)] text-[var(--danger)]"
                : "bg-[var(--accent-soft)] text-[var(--accent)]",
            )}
          >
            <AlertTriangle className="size-[18px]" />
          </span>
          <p className="pt-1.5 text-[14px] leading-relaxed text-[var(--text-secondary)]">
            {options?.message ?? "This cannot be undone."}
          </p>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext)
  if (!confirm) {
    throw new Error("useConfirm must be used inside a ConfirmProvider.")
  }
  return confirm
}
