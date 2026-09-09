import { auth, isFirebaseConfigured } from "@/lib/firebase"

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "")

/** Long enough to cover a cold start on Render's free plan, plus headroom. */
export const WAKE_TIMEOUT_MS = 90_000

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
    response = await fetch(`${BASE_URL}/api${path}`, {
      ...init,
      headers,
      // The API sleeps when idle on the free plan and takes around a minute
      // to wake, so this has to outlast that or every first request of the
      // day would be cancelled just short of succeeding. It exists to stop a
      // dead request hanging forever, not to enforce a snappy response.
      signal: init.signal ?? AbortSignal.timeout(WAKE_TIMEOUT_MS),
    })
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

/**
 * Fetch a file and save it.
 *
 * A plain <a download> cannot carry the bearer token, and the endpoint is
 * authenticated, so the bytes are fetched here and handed to a temporary
 * object URL. The filename comes from Content-Disposition when the server
 * sends one, so the API stays the single source of truth for naming.
 */
async function download(
  path: string,
  params: Record<string, unknown>,
  fallbackName: string,
): Promise<void> {
  const headers = await authHeader()
  const response = await fetch(`${BASE_URL}/api${path}${query(params)}`, {
    headers,
  })

  if (!response.ok) {
    const text = await response.text()
    let payload: unknown = null
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      payload = null
    }
    throw new ApiError(response.status, extractDetail(payload, response))
  }

  const disposition = response.headers.get("Content-Disposition") ?? ""
  const match = /filename="?([^";]+)"?/i.exec(disposition)
  const blob = await response.blob()

  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = match?.[1] ?? fallbackName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoked on the next tick: revoking synchronously can cancel the download
  // in WebKit before it has read the blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * POST a file as multipart/form-data.
 *
 * Separate from `post` because the body must NOT carry a Content-Type header:
 * the browser has to set it itself so it can append the multipart boundary,
 * and setting it by hand produces a body the server cannot parse.
 */
async function upload<T>(
  path: string,
  file: File,
  fields: Record<string, string | number> = {},
  fileField = "image",
): Promise<T> {
  const headers = await authHeader()
  delete (headers as Record<string, string>)["Content-Type"]

  const body = new FormData()
  body.append(fileField, file)
  for (const [key, value] of Object.entries(fields)) {
    body.append(key, String(value))
  }

  const response = await fetch(`${BASE_URL}/api${path}`, {
    method: "POST",
    headers,
    body,
  })

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

export const api = {
  upload,
  download,
  get: <T>(path: string, params: Record<string, unknown> = {}) =>
    request<T>(`${path}${query(params)}`),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (path: string) => request<void>(path, { method: "DELETE" }),
}
