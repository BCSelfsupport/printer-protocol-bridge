let adminSession: string | null = null;

export function setLicenseAdminSession(token: string | null) {
  adminSession = token;
}

export class LicenseAdminAccessError extends Error {
  constructor() { super('Please sign in again to manage licences.'); }
}

export async function licenseAdminApi(action: string, body?: Record<string, unknown>) {
  if (!adminSession) throw new LicenseAdminAccessError();
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/license?action=${encodeURIComponent(action)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, 'x-admin-token': adminSession },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (res.status === 401 || res.status === 403) {
    adminSession = null;
    throw new LicenseAdminAccessError();
  }
  if (!res.ok || data.error) throw new Error(data.error || 'Licence request failed. Please try again.');
  return data;
}