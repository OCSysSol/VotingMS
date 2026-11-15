/* v8 ignore next -- fallback is unreachable when VITE_API_BASE_URL is defined at build time; defaults to same-origin ("") when env var is absent */
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

const CLIENT_SESSION_STORAGE_KEY = "agm_client_session_id";

let _fallbackClientSessionId: string | null = null;

/**
 * Return a stable per-tab correlation ID for tracing a user's journey across
 * pre-auth and authenticated requests. Persisted in sessionStorage when
 * available, with an in-memory fallback for restricted environments.
 */
export function getClientSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(CLIENT_SESSION_STORAGE_KEY);
    if (existing) {
      return existing;
    }
    const generated = crypto.randomUUID();
    window.sessionStorage.setItem(CLIENT_SESSION_STORAGE_KEY, generated);
    return generated;
  } catch {
    /* v8 ignore next -- only reachable when sessionStorage throws (e.g. restricted iframe) */
    if (!_fallbackClientSessionId) {
      _fallbackClientSessionId = crypto.randomUUID();
    }
    /* v8 ignore next */
    return _fallbackClientSessionId;
  }
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  // Do not set Content-Type when the body is FormData — the browser sets the
  // correct multipart/form-data boundary automatically. Only inject the JSON
  // content-type for string bodies (i.e. JSON.stringify output).
  const contentTypeHeader: Record<string, string> =
    options?.body instanceof FormData
      ? {}
      : { "Content-Type": "application/json" };

  const { headers: _headers, ...restOptions } = options ?? {};
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      "X-Client-Session-ID": getClientSessionId(),
      ...contentTypeHeader,
      ...(_headers ?? {}),
    },
    credentials: "include",
    ...restOptions,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Like apiFetch but for endpoints that return no body (204 No Content).
 * Throws on non-2xx responses.
 */
export async function apiFetchVoid(
  path: string,
  options?: RequestInit
): Promise<void> {
  const contentTypeHeader: Record<string, string> =
    options?.body instanceof FormData
      ? {}
      : { "Content-Type": "application/json" };

  const { headers: _headers, ...restOptions } = options ?? {};
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      "X-Client-Session-ID": getClientSessionId(),
      ...contentTypeHeader,
      ...(_headers ?? {}),
    },
    credentials: "include",
    ...restOptions,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }
}

/** Fetch a binary response while preserving the same auth/error conventions. */
export async function apiFetchBlob(
  path: string,
  options?: RequestInit
): Promise<Blob> {
  const { headers: _headers, ...restOptions } = options ?? {};
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      "X-Client-Session-ID": getClientSessionId(),
      ...(_headers ?? {}),
    },
    credentials: "include",
    ...restOptions,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return response.blob();
}
