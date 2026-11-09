import { afterEach, describe, expect, it, vi } from 'vitest';
import { licenseAdminApi, setLicenseAdminSession } from '@/lib/licenseAdminApi';
import { issueAdminSession, verifyAdminSession } from '../../supabase/functions/_shared/adminSession';
import { webcrypto } from 'node:crypto';

afterEach(() => { setLicenseAdminSession(null); vi.unstubAllGlobals(); });

describe('licence administration access', () => {
  it('does not request protected data without a verified session', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(licenseAdminApi('list')).rejects.toThrow('Please sign in again');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('sends the verified session for each protected action', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ licenses: [] })));
    vi.stubGlobal('fetch', fetch);
    setLicenseAdminSession('test-signed-session');
    for (const action of ['list', 'create', 'deactivate', 'delete']) await licenseAdminApi(action);
    expect(fetch).toHaveBeenCalledTimes(4);
    for (const [, options] of fetch.mock.calls as unknown as [string, RequestInit][]) {
      expect(options.headers).toHaveProperty('x-admin-token', 'test-signed-session');
    }
  });
  it('invalidates refused credentials and never reports a failed change as success', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }));
    vi.stubGlobal('fetch', fetch);
    setLicenseAdminSession('expired-session');
    await expect(licenseAdminApi('deactivate')).rejects.toThrow('Please sign in again');
    await expect(licenseAdminApi('list')).rejects.toThrow('Please sign in again');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('rejects server errors rather than treating them as empty lists', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Unavailable' }), { status: 500 })));
    setLicenseAdminSession('test-session');
    await expect(licenseAdminApi('list')).rejects.toThrow('Unavailable');
  });
  it('accepts signed sessions but rejects tampering, wrong secrets and expiry', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const id = '12345678-1234-1234-1234-123456789012';
    const token = await issueAdminSession(id, 'test-only-secret', 1000);
    expect(await verifyAdminSession(token, 'test-only-secret', 1000)).toBe(id);
    expect(await verifyAdminSession(token, 'wrong-secret', 1000)).toBeNull();
    expect(await verifyAdminSession(`${token}a`, 'test-only-secret', 1000)).toBeNull();
    expect(await verifyAdminSession(token, 'test-only-secret', 1000 + 4 * 60 * 60 * 1000)).toBeNull();
  });
});