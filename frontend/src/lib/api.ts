const API_BASE = import.meta.env.VITE_API_URL || "/api"

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

function getCookie(name: string): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : ""
}

type RequestOptions = Omit<RequestInit, "body"> & { body?: unknown }

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers: extraHeaders, ...rest } = options
  const method = (rest.method || "GET").toUpperCase()
  const headers = new Headers(extraHeaders)
  headers.set("Accept", "application/json")
  if (body !== undefined) headers.set("Content-Type", "application/json")
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    const csrf = getCookie("friday_csrf")
    if (csrf) headers.set("X-CSRF-Token", csrf)
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...rest,
      method,
      headers,
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, "Cannot reach the server. Check that the API is running.")
  }

  if (response.status === 204) return undefined as T

  const text = await response.text()
  let payload: unknown = null
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
        ? payload.error
        : `Request failed (${response.status})`
    if (response.status === 401 && path !== "/auth/me" && path !== "/auth/login" && path !== "/auth/login/totp") {
      window.dispatchEvent(new CustomEvent("friday:unauthorized"))
    }
    throw new ApiError(response.status, message)
  }
  return payload as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body }),
  delete: <T = void>(path: string) => request<T>(path, { method: "DELETE" }),
}

export function oidcStartURL(): string {
  return `${API_BASE}/auth/oidc/start`
}
