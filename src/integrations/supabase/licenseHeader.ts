// Injects the active license key as the `x-license-key` header on every
// Supabase request. The shared data tables (`data_sources`, `data_source_rows`,
// `print_jobs`) require this header to satisfy their RLS policies. Without an
// activated license, calls return empty / are rejected — by design.
import { supabase } from "./client";

const LICENSE_STORAGE_KEY = "codesync-license";

function readKey(): string | null {
  try {
    const raw = localStorage.getItem(LICENSE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.productKey === "string" ? parsed.productKey : null;
  } catch {
    return null;
  }
}

function applyHeader(key: string | null) {
  // The supabase-js client exposes an internal `headers` object on its REST
  // and Realtime clients via `(supabase as any).rest.headers`. Setting it here
  // mutates the headers used for every subsequent request.
  const anyClient = supabase as unknown as {
    rest?: { headers?: Record<string, string> };
    realtime?: { setAuth?: (token: string) => void };
  };
  if (anyClient.rest && anyClient.rest.headers) {
    if (key) {
      anyClient.rest.headers["x-license-key"] = key;
    } else {
      delete anyClient.rest.headers["x-license-key"];
    }
  }
  // Functions client uses the same internal headers; supabase-js v2 reads
  // from a single `headers` map on the underlying fetch, so this covers it.
}

let started = false;
export function initLicenseHeaderSync() {
  if (started) return;
  started = true;
  applyHeader(readKey());
  // Re-sync whenever the stored license changes (activation, deactivation,
  // multi-tab updates).
  window.addEventListener("storage", (e) => {
    if (e.key === LICENSE_STORAGE_KEY) applyHeader(readKey());
  });
}

export function setLicenseHeader(key: string | null) {
  applyHeader(key);
}
