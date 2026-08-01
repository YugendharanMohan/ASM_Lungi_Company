import { auth, isFirebaseConfigured } from "@/lib/firebase"

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "")

/** An API error carrying the backend's own message, ready to show a user. */
export class ApiError extends Error {
  // Declared and assigned explicitly rather than as a constructor parameter
  // property: `erasableSyntaxOnly` (set by the Vite template) rejects the
  // shorthand because it emits runtime code.
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

async function authHeader(): Promise<Record<string, string>> {
  if (!isFirebaseConfigured || !auth?.currentUser) return {}
  // Not cached: getIdToken refreshes on its own when the hour is nearly up,
  // and a stale token means a 401 mid-session.
  const token = await auth.currentUser.getIdToken()
  return { Authorization: `Bearer ${token}` }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...(await authHeader()),
    ...((init.headers as Record<string, string>) ?? {}),
  }

  let response: Response
  try {
    response = await fetch(`${BASE_URL}/api${path}`, { ...init, headers })
  } catch {
    throw new ApiError(
      0,
      "Cannot reach the server. Check that the backend is running.",
    )
  }

  if (response.status === 204) return undefined as T

  const text = await response.text()
  let payload: unknown = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    payload = null
  }

  if (!response.ok) {
    throw new ApiError(response.status, extractDetail(payload, response))
  }
  return payload as T
}

/** FastAPI reports errors as `detail`, either a string or a 422 field list. */
function extractDetail(payload: unknown, response: Response): string {
  const detail = (payload as { detail?: unknown } | null)?.detail
  if (typeof detail === "string") return detail

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        const loc = Array.isArray(item?.loc)
          ? item.loc.filter((p: unknown) => p !== "body").join(".")
          : ""
        return loc ? `${loc}: ${item.msg}` : item.msg
      })
      .filter(Boolean)
    if (messages.length) return messages.join("\n")
  }
  return `Request failed (${response.status}).`
}

function query(params: Record<string, unknown>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value))
    }
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ""
}

export const api = {
  get: <T>(path: string, params: Record<string, unknown> = {}) =>
    request<T>(`${path}${query(params)}`),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (path: string) => request<void>(path, { method: "DELETE" }),
}
