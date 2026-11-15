import { useCallback, useEffect, useState } from "react"
import { auth } from "./firebase"

export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/$/, "")

export class ApiError extends Error {
  constructor(status, message, data) {
    super(message)
    this.status = status
    this.data = data
  }
}

// Calls the backend with the signed-in user's Firebase ID token. The token
// identifies the user, so no email/uid is ever sent in the request itself.
export async function api(path, { method = "GET", body, formData, raw = false } = {}) {
  const headers = {}
  const user = auth.currentUser
  if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`
  if (body !== undefined) headers["Content-Type"] = "application/json"

  let res
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: formData ?? (body !== undefined ? JSON.stringify(body) : undefined),
    })
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.")
  }

  if (raw && res.ok) return res
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data.message || `Request failed (${res.status})`, data)
  return data
}

// Loads `path` on mount (and when it changes); `reload()` fetches again.
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: Boolean(path) })

  const load = useCallback(async () => {
    if (!path) return
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      setState({ data: await api(path), error: null, loading: false })
    } catch (error) {
      setState({ data: null, error, loading: false })
    }
  }, [path])

  useEffect(() => {
    load()
  }, [load])

  return { ...state, reload: load }
}
