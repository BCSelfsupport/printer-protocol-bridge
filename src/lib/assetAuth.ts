/**
 * Authenticated Asset URL Builder
 * 
 * Constructs URLs for proprietary assets (fonts, templates, fault codes)
 * that go through the serve-asset edge function with license validation.
 * 
 * In dev mode, falls back to public folder for convenience.
 */

const LICENSE_STORAGE_KEY = 'codesync-license';
const MACHINE_ID_KEY = 'codesync-machine-id';

interface CachedLicense {
  productKey: string;
  tier: string;
}

function getLicenseCredentials(): { productKey: string; machineId: string } | null {
  try {
    const saved = localStorage.getItem(LICENSE_STORAGE_KEY);
    if (!saved) return null;
    const { productKey } = JSON.parse(saved) as CachedLicense;
    const machineId = localStorage.getItem(MACHINE_ID_KEY);
    if (!productKey || !machineId) return null;
    return { productKey, machineId };
  } catch {
    return null;
  }
}

/**
 * Build an authenticated URL for a proprietary asset.
 * 
 * @param assetPath - Path relative to the storage bucket root, e.g.:
 *   - "fonts/Standard7High.bin"
 *   - "templates/1L7U.BIN" 
 *   - "fault-codes/01-0001.png"
 * @returns Full URL to the serve-asset edge function with license query params,
 *          or a fallback public URL in dev mode / when no license is present.
 */
export function getAuthenticatedAssetUrl(assetPath: string): string {
  // In dev mode, fall back to public folder for convenience
  if (import.meta.env.DEV) {
    return `/${assetPath}`;
  }

  const creds = getLicenseCredentials();
  if (!creds) {
    // No license — return empty string or a placeholder; the UI should handle this
    // (license lockout should prevent reaching this point in production)
    return `/${assetPath}`;
  }

  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  const params = new URLSearchParams({
    path: assetPath,
    key: creds.productKey,
    mid: creds.machineId,
  });

  return `${baseUrl}/functions/v1/serve-asset?${params.toString()}`;
}

/**
 * Fetch a proprietary asset with license authentication.
 * Useful for binary files (templates, fonts) that need ArrayBuffer access.
 */
export async function fetchAuthenticatedAsset(assetPath: string): Promise<Response> {
  const url = getAuthenticatedAssetUrl(assetPath);

  // In dev mode or fallback, just fetch normally
  if (!url.includes('/functions/v1/serve-asset')) {
    return fetch(url);
  }

  return fetch(url, {
    headers: {
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    },
  });
}
