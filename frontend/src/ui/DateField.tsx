import { useId } from "react"
import { Calendar } from "lucide-react"

import { controlClasses, describedBy, FieldShell } from "@/ui/FieldShell"
import { cn } from "@/lib/utils"

/**
 * Date picker on a native `<input type="date">`.
 *
 * The browser's own calendar is the right answer here: it is localised, it is
 * keyboard accessible, and on a phone it opens the platform date wheel. The
 * native indicator is hidden and the whole field opens the picker instead, so
 * the target is the full 58px row rather than a 16px glyph.
 */
export function DateField({
  label,
  value,
  onChange,
  min,
  max,
  error,
  hint,
  required,
  disabled,
  className,
  id,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  error?: string
  hint?: string
  required?: boolean
  disabled?: boolean
  className?: string
  id?: string
}) {
  const generated = useId()
  const inputId = id ?? generated

  return (
    <FieldShell
      id={inputId}
      label={label}
      icon={<Calendar className="size-[18px]" />}
      error={error}
      hint={hint}
      className={className}
    >
      <input
        id={inputId}
        type="date"
        value={value}
        min={min}
        max={max}
        required={required}
        disabled={disabled}
        placeholder=" "
        data-filled={value ? "true" : "false"}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(inputId, error, hint)}
        onChange={(event) => onChange(event.target.value)}
        onClick={(event) => {
          // showPicker is not in every engine; the click still focuses the
          // field and the browser's own affordance remains as a fallback.
          const el = event.currentTarget as HTMLInputElement & {
            showPicker?: () => void
          }
          try {
            el.showPicker?.()
          } catch {
            /* Firefox throws when called without user activation. */
          }
        }}
        className={cn(
          controlClasses({ hasIcon: true }),
          "cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
          "[&::-webkit-calendar-picker-indicator]:absolute",
          "[&::-webkit-calendar-picker-indicator]:inset-0",
          "[&::-webkit-calendar-picker-indicator]:h-full",
          "[&::-webkit-calendar-picker-indicator]:w-full",
          "[&::-webkit-calendar-picker-indicator]:cursor-pointer",
          "[&::-webkit-calendar-picker-indicator]:opacity-0",
          "[&::-webkit-date-and-time-value]:text-left",
          !value && "text-transparent",
        )}
      />
    </FieldShell>
  )
}
