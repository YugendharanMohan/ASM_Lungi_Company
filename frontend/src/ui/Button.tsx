import {
  forwardRef,
  useCallback,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react"
import { AnimatePresence, motion } from "motion/react"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

type Variant = "primary" | "secondary" | "ghost" | "danger"
type Size = "sm" | "md" | "lg"

interface Ripple {
  id: number
  x: number
  y: number
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-hover)] shadow-[var(--shadow-sm)]",
  secondary:
    "bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--surface-sunken)]",
  ghost:
    "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text)]",
  danger:
    "bg-[var(--danger-soft)] text-[var(--danger)] hover:bg-[var(--danger)] hover:text-white",
}

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-[10px]",
  md: "h-10 px-4 text-[14px] gap-2 rounded-[12px]",
  lg: "h-12 px-6 text-[15px] gap-2 rounded-[14px]",
}

// motion.button redefines the pointer/animation handlers with its own
// signatures, so React's versions are dropped rather than left to collide.
type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  | "onAnimationStart"
  | "onAnimationEnd"
  | "onAnimationIteration"
  | "onDrag"
  | "onDragStart"
  | "onDragEnd"
  | "onTransitionEnd"
>

export interface ButtonProps extends NativeButtonProps {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
  fullWidth?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      loading = false,
      icon,
      fullWidth,
      className,
      children,
      disabled,
      onClick,
      ...props
    },
    ref,
  ) {
    const [ripples, setRipples] = useState<Ripple[]>([])

    const handleClick = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        const rect = event.currentTarget.getBoundingClientRect()
        const id = Date.now()
        setRipples((prev) => [
          ...prev,
          { id, x: event.clientX - rect.left, y: event.clientY - rect.top },
        ])
        // Cleared on a timer rather than onAnimationComplete so a rapid
        // double-click cannot leave an orphaned ripple painted on the button.
        window.setTimeout(
          () => setRipples((prev) => prev.filter((r) => r.id !== id)),
          520,
        )
        onClick?.(event)
      },
      [onClick],
    )

    return (
      <motion.button
        ref={ref}
        whileHover={disabled || loading ? undefined : { scale: 1.015 }}
        whileTap={disabled || loading ? undefined : { scale: 0.975 }}
        transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
        disabled={disabled || loading}
        onClick={handleClick}
        className={cn(
          "relative isolate inline-flex select-none items-center justify-center overflow-hidden font-medium",
          "transition-colors duration-200",
          "disabled:pointer-events-none disabled:opacity-45",
          VARIANTS[variant],
          SIZES[size],
          fullWidth && "w-full",
          className,
        )}
        {...props}
      >
        <AnimatePresence>
          {ripples.map((ripple) => (
            <motion.span
              key={ripple.id}
              aria-hidden
              initial={{ opacity: 0.28, scale: 0 }}
              animate={{ opacity: 0, scale: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              style={{ left: ripple.x, top: ripple.y }}
              className="pointer-events-none absolute -z-10 size-[220px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-current"
            />
          ))}
        </AnimatePresence>

        {loading ? (
          <Loader2 className="size-4 shrink-0 animate-spin" />
        ) : (
          icon
        )}
        {children}
      </motion.button>
    )
  },
)
