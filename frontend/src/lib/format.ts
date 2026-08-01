const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
})

// en-IN grouping (1,23,456) is what the office reads on every other document.
const decimal = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const integer = new Intl.NumberFormat("en-IN")

// Lakh/crore shorthand: a stat tile showing ₹1,04,320.50 wraps, and nobody
// reads the paise off a dashboard anyway.
const compact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
})

export const formatCurrency = (value: number) => currency.format(value ?? 0)
export const formatCurrencyCompact = (value: number) =>
  compact.format(value ?? 0)
export const formatMeters = (value: number) => `${decimal.format(value ?? 0)} m`
export const formatNumber = (value: number) => integer.format(value ?? 0)

/** ISO date (YYYY-MM-DD) for <input type="date"> and API params. */
export function toISODate(date: Date): string {
  const offset = date.getTimezoneOffset()
  // Shift by the local offset before slicing: toISOString() converts to UTC,
  // which rolls the date backwards for anywhere east of Greenwich — India
  // included, so "today" would render as yesterday every evening.
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10)
}

export const todayISO = () => toISODate(new Date())

/** Render an ISO date as e.g. "01 Aug 2026" without timezone drift. */
export function formatDate(iso: string): string {
  if (!iso) return ""
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number)
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })
}

export function formatDateShort(iso: string): string {
  if (!iso) return ""
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number)
  return new Date(year, month - 1, day).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  })
}
