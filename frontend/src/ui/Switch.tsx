import { useId } from "react"
import { motion } from "motion/react"

import { cn } from "@/lib/utils"

/**
 * iOS-style switch presented as a full-width row.
 *
 * The knob is animated with motion rather than a CSS sibling selector: the
 * knob sits inside the track, so Tailwind's `peer-checked:` (a general-sibling
 * selector) cannot reach it, and the class silently does nothing.
 */
export function Switch({
  checked,
  onChange,
  label,
  description,
  id,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  id?: string
}) {
  const generated = useId()
  const inputId = id ?? generated

  return (
    <label
      htmlFor={inputId}
      className={cn(
        "flex cursor-pointer items-center justify-between gap-4 rounded-[14px]",
        "border border-[var(--border)] bg-[var(--surface)] px-4 py-3.5",
        "transition-colors hover:bg-[var(--surface-2)]",
      )}
    >
      <span className="min-w-0">
        <span className="block text-[14px] font-medium text-[var(--text)]">
          {label}
        </span>
        {description && (
          <span className="mt-0.5 block text-[12.5px] text-[var(--text-tertiary)]">
            {description}
          </span>
        )}
      </span>

      <input
        id={inputId}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={cn(
          "relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200",
          "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]",
          checked ? "bg-[var(--success)]" : "bg-[var(--border)]",
        )}
      >
        <motion.span
          animate={{ x: checked ? 20 : 0 }}
          transition={{ type: "spring", stiffness: 520, damping: 32 }}
          className="absolute left-[2px] top-[2px] size-[27px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25)]"
        />
      </span>
    </label>
  )
}
