import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from "react"

import { controlClasses, describedBy, FieldShell } from "@/ui/FieldShell"
import { cn } from "@/lib/utils"

export interface FieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "placeholder"> {
  label: string
  icon?: ReactNode
  error?: string
  hint?: string
  suffix?: ReactNode
}

/** Text, number, tel and email input with a floating label. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, icon, error, hint, suffix, className, id, ...props },
  ref,
) {
  const generated = useId()
  const inputId = id ?? generated

  return (
    <FieldShell
      id={inputId}
      label={label}
      icon={icon}
      error={error}
      hint={hint}
      className={className}
      trailing={
        suffix ? (
          <span className="text-[14px] font-medium">{suffix}</span>
        ) : undefined
      }
    >
      <input
        ref={ref}
        id={inputId}
        placeholder=" "
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, error, hint)}
        className={cn(
          controlClasses({ hasIcon: Boolean(icon), hasTrailing: Boolean(suffix) }),
          // Autofill paints its own background; keep the surface and text
          // colours so the field does not flash yellow on return visits.
          "[&:-webkit-autofill]:[-webkit-text-fill-color:var(--text)]",
          "[&:-webkit-autofill]:[transition:background-color_9999s_ease-in-out_0s]",
          // The stepper arrows fight the floating label for the same corner.
          "[&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
          "[-moz-appearance:textfield]",
        )}
        // Phone keyboards capitalise the first letter and autocorrect as you
        // type, which quietly mangles an address before it is ever submitted.
        // Firebase happens to ignore case, but it rejects a padded address
        // outright, and the user cannot see what the keyboard did. Applied to
        // email fields only, and still overridable by the caller below.
        {...(props.type === "email"
          ? {
              autoCapitalize: "none" as const,
              autoCorrect: "off" as const,
              spellCheck: false,
              inputMode: "email" as const,
            }
          : {})}
        {...props}
      />
    </FieldShell>
  )
})
