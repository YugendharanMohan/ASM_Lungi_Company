export type Shift = "DAY" | "NIGHT"
export type UserRole = "ADMIN" | "STAFF"

/** Reed/pick count of the cloth. Each carries its own piece rate. */
export type PickType = "88x96" | "88x92" | "88x80"

export const PICK_TYPES: PickType[] = ["88x96", "88x92", "88x80"]

export interface AppUser {
  id: number
  email: string
  display_name: string
  role: UserRole
  is_active: boolean
  firebase_uid: string | null
  created_at: string
  last_login_at: string | null
}

export interface Shed {
  id: number
  name: string
  location: string
  created_at: string
  loom_count: number
}

export interface Loom {
  id: number
  loom_number: string
  shed_id: number
  is_active: boolean
  created_at: string
  shed_name: string
  /** "AA - 3" — the loom's name wherever a person reads it. */
  label: string
}

export interface Worker {
  id: number
  name: string
  phone: string
  shed_id: number | null
  rate_per_meter: number
  is_active: boolean
  created_at: string
  shed_name: string
}

export interface ProductionEntry {
  id: number
  entry_date: string
  shift: Shift
  pick_type: PickType
  worker_id: number
  loom_id: number
  meters: number
  rate_per_meter: number
  total_amount: number
  created_at: string
  worker_name: string
  loom_number: string
  shed_name: string
  loom_label: string
}

/** Cloth leaves the mill in bundles; the count per bundle is fixed. */
export const LUNGIS_PER_BUNDLE = 24

/**
 * Picks a consignment can contain — wider than the production `PickType`.
 * Kambam 88x96 is its own line on the delivery note but is woven on the same
 * setting, so the loom floor does not distinguish it.
 */
export type DispatchPick = "88x96" | "88x92" | "88x80" | "88x96 Kambam"

export const DISPATCH_PICKS: DispatchPick[] = [
  "88x96",
  "88x92",
  "88x80",
  "88x96 Kambam",
]

export interface DispatchItem {
  pick_type: DispatchPick
  bundles: number
  lungis: number
}

export interface Dispatch {
  id: number
  company_name: string
  dispatch_date: string
  remarks: string
  created_at: string
  items: DispatchItem[]
  total_bundles: number
  /** Total pieces across every line. */
  quantity: number
}

export interface SalaryRow {
  worker_id: number
  worker_name: string
  phone: string
  shed_name: string
  total_meters: number
  total_amount: number
  entry_count: number
}

export interface SalaryReport {
  period: string
  start_date: string
  end_date: string
  rows: SalaryRow[]
  total_meters: number
  total_amount: number
}

export interface RateGroup {
  rate: number
  pick_types: PickType[]
  meters: number
  amount: number
}

export interface ReceiptCell {
  loom_label: string
  meters: number | null
}

export interface ReceiptRow {
  entry_date: string
  cells: ReceiptCell[]
  total: number
}

export interface SalaryReceipt {
  worker_id: number
  worker_name: string
  phone: string
  start_date: string
  end_date: string
  loom_labels: string[]
  rows: ReceiptRow[]
  loom_totals: ReceiptCell[]
  rate_groups: RateGroup[]
  total_meters: number
  total_amount: number
  average_rate: number
}

export interface DashboardStats {
  today: string
  week_start: string
  week_end: string
  today_meters: number
  today_amount: number
  week_meters: number
  week_amount: number
  total_workers: number
  active_workers: number
  total_looms: number
  total_sheds: number
  week_dispatch_quantity: number
  week_dispatch_by_company: { company_name: string; quantity: number }[]
  daily_production: { date: string; meters: number }[]
}
