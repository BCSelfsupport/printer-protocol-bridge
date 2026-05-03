// Injects the active license key as the `x-license-key` header on every
// outgoing Supabase REST/Functions request. Required by the RLS policies
// on `data_sources`, `data_source_rows`, and `print_jobs`, and by the
// gated edge functions (check-printer-status, github-build-status,
// trigger-build).
//
// Implementation: a one-time global `fetch` patch. We only attach the
// header to requests targeting our Supabase project, never to third-party
// URLs.

const LICENSE_STORAGE_KEY = "codesync-license";
const SUPABASE_HOST = (() => {
  try {
    return new URL(import.meta.env.VITE_SUPABASE_URL ?? "").host;
  } catch {
    return "";
  }
})();

function readKey(): string | null {
  try {
    const raw = localStorage.getItem(LICENSE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const k = parsed?.productKey;
    return typeof k === "string" && k.length > 0 ? k : null;
  } catch {
    return null;
  }
}

let installed = false;
export function initLicenseHeaderSync() {
  if (installed || typeof window === "undefined" || !SUPABASE_HOST) return;
  installed = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let urlStr = "";
    try {
      if (typeof input === "string") urlStr = input;
      else if (input instanceof URL) urlStr = input.toString();
      else urlStr = (input as Request).url;
    } catch {
      // ignore
    }

    let isSupabase = false;
    try {
      isSupabase = !!urlStr && new URL(urlStr, window.location.href).host === SUPABASE_HOST;
    } catch {
      isSupabase = false;
    }

    if (!isSupabase) return originalFetch(input as RequestInfo, init);

    const key = readKey();
    if (!key) return originalFetch(input as RequestInfo, init);

    // Merge headers from init or the Request object.
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!headers.has("x-license-key")) headers.set("x-license-key", key);

    return originalFetch(input as RequestInfo, { ...init, headers });
  };
}
