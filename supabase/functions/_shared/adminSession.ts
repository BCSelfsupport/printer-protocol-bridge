const encoder = new TextEncoder();
const SESSION_MS = 4 * 60 * 60 * 1000;

async function signingKey(secret: string) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function issueAdminSession(licenseId: string, secret: string, now = Date.now()) {
  const payload = btoa(JSON.stringify({ licenseId, expiresAt: now + SESSION_MS }));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await signingKey(secret), encoder.encode(payload)));
  return `${payload}.${Array.from(signature, byte => byte.toString(16).padStart(2, '0')).join('')}`;
}

export async function verifyAdminSession(token: string, secret: string, now = Date.now()): Promise<string | null> {
  try {
    const [payload, signature, extra] = token.split('.');
    if (!payload || !signature || extra || !/^[a-f0-9]{64}$/.test(signature)) return null;
    const bytes = Uint8Array.from(signature.match(/.{2}/g) ?? [], hex => parseInt(hex, 16));
    if (!await crypto.subtle.verify('HMAC', await signingKey(secret), bytes, encoder.encode(payload))) return null;
    const data = JSON.parse(atob(payload));
    if (typeof data.licenseId !== 'string' || !/^[0-9a-f-]{36}$/i.test(data.licenseId) ||
        !Number.isFinite(data.expiresAt) || data.expiresAt <= now || data.expiresAt > now + SESSION_MS) return null;
    return data.licenseId;
  } catch {
    return null;
  }
}