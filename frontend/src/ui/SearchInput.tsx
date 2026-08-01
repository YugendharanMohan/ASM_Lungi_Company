import { Search, X } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import { cn } from "@/lib/utils"

/** Compact search box — pill shaped, iOS style, with a clear affordance. */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search",
  className,
  "aria-label": ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  "aria-label"?: string
}) {
  return (
    <div
      className={cn(
        "group relative flex h-10 items-center rounded-[var(--radius-pill)]",
        "border border-[var(--border)] bg-[var(--surface)]",
        "transition-[border-color,box-shadow] duration-200",
        "focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_3.5px_var(--ring)]",
        className,
      )}
    >
      <Search
        aria-hidden
        className="pointer-events-none absolute left-3.5 size-4 text-[var(--text-tertiary)] transition-colors group-focus-within:text-[var(--accent)]"
      />
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "h-full w-full rounded-[var(--radius-pill)] bg-transparent pl-10 pr-9",
          "text-[14px] text-[var(--text)] outline-none",
          "placeholder:text-[var(--text-tertiary)]",
          // The engine's own clear button would sit beside ours.
          "[&::-webkit-search-cancel-button]:appearance-none",
        )}
      />
      <AnimatePresence>
        {value && (
          <motion.button
            type="button"
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ duration: 0.14 }}
            onClick={() => onChange("")}
            aria-label="Clear search"
            className="absolute right-2.5 flex size-5 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text)]"
          >
            <X className="size-3" strokeWidth={2.5} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
