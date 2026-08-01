import { useId, type ReactNode } from "react"
import { ChevronDown } from "lucide-react"

import { controlClasses, describedBy, FieldShell } from "@/ui/FieldShell"
import { cn } from "@/lib/utils"

export interface SelectOption {
  value: string
  label: string
}

/**
 * Dropdown built on a native `<select>`, restyled end to end.
 *
 * A custom listbox would let us animate the menu, but the native control gives
 * the iOS wheel picker and Android's sheet for free — closer to "feels like a
 * native app" on a phone than anything rendered in the page — plus keyboard
 * type-ahead and screen-reader support with no extra code. Only the chrome is
 * ours: appearance is stripped and the chevron is drawn.
 */
export function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder = "Select",
  icon,
  error,
  hint,
  disabled,
  required,
  className,
  id,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  icon?: ReactNode
  error?: string
  hint?: string
  disabled?: boolean
  required?: boolean
  className?: string
  id?: string
}) {
  const generated = useId()
  const selectId = id ?? generated

  return (
    <FieldShell
      id={selectId}
      label={label}
      icon={icon}
      error={error}
      hint={hint}
      className={className}
      trailing={<ChevronDown className="size-4" />}
    >
      <select
        id={selectId}
        value={value}
        disabled={disabled}
        required={required}
        data-filled={value ? "true" : "false"}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(selectId, error, hint)}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          controlClasses({ hasIcon: Boolean(icon), hasTrailing: true }),
          "cursor-pointer appearance-none disabled:cursor-not-allowed disabled:opacity-50",
          // An empty value shows the label at rest, so its own text must not
          // sit behind it.
          !value && "text-transparent",
        )}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}
