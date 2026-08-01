export type Shift = "DAY" | "NIGHT"
export type UserRole = "ADMIN" | "STAFF"

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
}

export interface Worker {
  id: number
  name: string
  phone: string
  shed_id: number | null
  loom_id: number | null
  rate_per_meter: number
  is_active: boolean
  created_at: string
  shed_name: string
  loom_number: string
}

export interface ProductionEntry {
  id: number
  entry_date: string
  shift: Shift
  worker_id: number
  loom_id: number
  meters: number
  rate_per_meter: number
  total_amount: number
  created_at: string
  worker_name: string
  loom_number: string
  shed_name: string
}

export interface Dispatch {
  id: number
  company_name: string
  dispatch_date: string
  quantity: number
  remarks: string
  created_at: string
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
  period: "daily" | "weekly" | "monthly"
  start_date: string
  end_date: string
  rows: SalaryRow[]
  total_meters: number
  total_amount: number
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
