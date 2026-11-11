const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const selfsigned = require('selfsigned');
const { isLanAddress, sameSecret, hash, canAccess, sanitizeSnapshot } = require('./security.cjs');
const PORT = 8767;
const MAX_BODY = 2 * 1024 * 1024;
const LICENSE_URL = 'https://lpqatjynvfyhrizaioxi.supabase.co/functions/v1/license?action=validate';
// The publishable API key is passed by the local renderer; it cannot grant entitlement.
function createMasterSharing({ app, safeStorage, powerSaveBlocker, getIPs, onViewerMode }) {
  const file = path.join(app.getPath('userData'), 'master-sharing.json');
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  let server = null, enabled = false, pairing = null, entitlement = null, blocker = null;
  let snapshot = null, history = { revision: 0, runs: [], snapshots: [], templates: [] };
  const pending = new Map(), viewers = new Map(), attempts = new Map();
  let legacyToken = crypto.randomBytes(32).toString('hex');
  let identity = null;
  const persist = () => fs.writeFileSync(file, JSON.stringify(saved), { mode: 0o600 });
  const protect = value => {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows credential protection is unavailable');
    return safeStorage.encryptString(JSON.stringify(value)).toString('base64');
  };
  const reveal = value => {
    try { return JSON.parse(safeStorage.decryptString(Buffer.from(value, 'base64'))); } catch { return null; }
  };
  const mode = () => saved.viewer ? 'viewer' : 'control';
  const validEntitlement = () => entitlement && entitlement.expiresAt > Date.now();
  async function authorize(credentials) {
    if (!credentials || typeof credentials.productKey !== 'string' || typeof credentials.machineId !== 'string') throw new Error('Activate a Master PC licence first');
    let result;
    try {
      const res = await fetch(LICENSE_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: credentials.apiKey }, body: JSON.stringify({ product_key: credentials.productKey, machine_id: credentials.machineId }), signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error('Licence verification failed');
      result = await res.json();
    } catch (error) {
      const cached = saved.entitlement ? reveal(saved.entitlement) : null;
      if (cached && cached.binding === hash(credentials.productKey + credentials.machineId) && cached.expiresAt > Date.now()) { entitlement = cached; return; }
      throw error;
    }
    if (!result.valid || result.tier === 'lite') {
      entitlement = null; delete saved.entitlement; persist();
      await stop();
      throw new Error(result.error || 'A network-capable Master PC licence is required');
    }
    entitlement = { binding: hash(credentials.productKey + credentials.machineId), tier: result.tier, expiresAt: Date.now() + 30 * 60 * 1000 };
    saved.entitlement = protect(entitlement); persist();
  }
  function info() {
    return { mode: mode(), enabled: enabled && !!validEntitlement(), configured: enabled, name: app.getName(), addresses: getIPs().filter(isLanAddress).map(ip => `${ip}:${PORT}`), fingerprint: identity ? hash(new crypto.X509Certificate(identity.cert).raw) : null, code: pairing && pairing.expiresAt > Date.now() ? pairing.code : null, expiresAt: pairing?.expiresAt ?? null, pending: [...pending.values()].map(p => ({ id: p.id, name: p.name })), viewers: [...viewers.values()].map(v => ({ id: v.id, name: v.name, lastSeen: v.lastSeen })) };
  }
  async function start(credentials) {
    if (mode() === 'viewer') throw new Error('Viewing PCs cannot become Master PCs while paired');
    await authorize(credentials);
    if (enabled) return info();
    identity = saved.identity ? reveal(saved.identity) : null;
    if (!identity) {
      const cert = await selfsigned.generate([{ name: 'commonName', value: 'CodeSync Master PC' }], { keySize: 2048, days: 3650, algorithm: 'sha256' });
      identity = { key: cert.private, cert: cert.cert };
      saved.identity = protect(identity); persist();
    }
    server = https.createServer(identity, handle);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(PORT, '0.0.0.0', resolve); });
    enabled = true;
    saved.sharingEnabled = true; persist();
    blocker = powerSaveBlocker.start('prevent-app-suspension');
    return newCode();
  }
  async function stop(preserve = false) {
    if (!preserve) { saved.sharingEnabled = false; persist(); }
    enabled = false; pairing = null; pending.clear(); snapshot = null;
    if (server) { server.closeAllConnections(); server.close(); server = null; }
    if (blocker !== null) { powerSaveBlocker.stop(blocker); blocker = null; }
    return info();
  }
  function newCode() {
    if (!enabled || !validEntitlement()) throw new Error('Master sharing is not enabled');
    pairing = { code: crypto.randomInt(10000000, 100000000).toString(), expiresAt: Date.now() + 5 * 60 * 1000 };
    pending.clear(); return info();
  }
  function approve(id) {
    const p = pending.get(id);
    if (!p || p.expiresAt < Date.now() || !validEntitlement()) throw new Error('Pairing request expired');
    const v = { ...p, lastSeen: Date.now() };
    viewers.set(id, v); pending.delete(id);
    saved.viewers = protect([...viewers.values()]); persist(); return info();
  }
  const restored = saved.viewers ? reveal(saved.viewers) : null;
  if (Array.isArray(restored)) for (const v of restored) viewers.set(v.id, v);
  function revoke(id) { viewers.delete(id); pending.delete(id); saved.viewers = protect([...viewers.values()]); persist(); return info(); }
  async function body(req) {
    let size = 0, chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) throw new Error('Request too large'); chunks.push(chunk); }
    return JSON.parse(Buffer.concat(chunks).toString() || '{}');
  }
  function reply(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
  async function handle(req, res) {
    try {
      const remote = req.socket.remoteAddress?.replace('::ffff:', '');
      if (!isLanAddress(remote) || !enabled || !validEntitlement()) return reply(res, 403, { error: 'Master sharing unavailable' });
      if (req.method !== 'POST') return reply(res, 405, { error: 'Read-only service' });
      const data = await body(req);
      if (req.url === '/view/pair') {
        const attempt = attempts.get(remote) || { count: 0, until: Date.now() + 60000 };
        if (attempt.until < Date.now()) { attempt.count = 0; attempt.until = Date.now() + 60000; }
        attempts.set(remote, attempt);
        if (++attempt.count > 5) return reply(res, 429, { error: 'Too many pairing attempts; wait one minute' });
        if (!pairing || pairing.expiresAt < Date.now() || !sameSecret(data.code, pairing.code)) return reply(res, 403, { error: 'Invalid or expired pairing code' });
        if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 80 || typeof data.key !== 'string' || !/^[a-f0-9]{64}$/.test(data.key)) return reply(res, 400, { error: 'Invalid viewing PC details' });
        const id = crypto.randomUUID(); pending.set(id, { id, name: data.name.trim(), keyHash: hash(data.key), expiresAt: Date.now() + 5 * 60 * 1000 });
        pairing = null; return reply(res, 200, { id, status: 'pending', name: app.getName(), schema: 1 });
      }
      const v = viewers.get(data.id), p = pending.get(data.id);
      const auth = v || p;
      if (!auth || !sameSecret(hash(String(data.key || '')), auth.keyHash)) return reply(res, 401, { error: 'Viewing access removed; pair again' });
      if (req.url === '/view/pair-status') {
        if (!v && p.expiresAt < Date.now()) { pending.delete(p.id); return reply(res, 401, { error: 'Pairing approval expired' }); }
        return reply(res, 200, { status: v ? 'approved' : 'pending', schema: 1 });
      }
      if (!v || !canAccess('viewer', req.method, req.url)) return reply(res, 403, { error: 'View-only access: operation denied' });
      v.lastSeen = Date.now();
      if (req.url === '/view/leave') { revoke(v.id); return reply(res, 200, { success: true }); }
      if (req.url === '/view/snapshot') return reply(res, 200, { snapshot, historyRevision: history.revision, name: app.getName(), schema: 1 });
      if (req.url === '/view/history') {
        const store = ['runs','snapshots','templates'].includes(data.store) ? data.store : 'runs';
        const offset = Number.isInteger(data.offset) && data.offset >= 0 ? data.offset : 0;
        return reply(res, 200, { revision: history.revision, records: history[store].slice(offset, offset + 200), next: offset + 200 < history[store].length ? offset + 200 : null });
      }
    } catch { reply(res, 400, { error: 'Invalid sharing request' }); }
  }
  // Pin TLS trust in the main process. No app-wide certificate exceptions.
  function request(address, fingerprint, route, data) {
    const [ip, portText] = String(address).split(':');
    if (!isLanAddress(ip) || (portText && portText !== String(PORT)) || !/^[a-f0-9]{64}$/i.test(fingerprint)) return Promise.reject(new Error('Use the Master factory address and certificate fingerprint'));
    return new Promise((resolve, reject) => {
      const req = https.request({ hostname: ip, port: PORT, method: 'POST', path: route, rejectUnauthorized: false, agent: false }, res => {
        if (!sameSecret(hash(res.socket.getPeerCertificate().raw), fingerprint.toLowerCase())) { res.destroy(); reject(new Error('Master identity changed; verify and pair again')); return; }
        let size = 0, chunks = [];
        res.on('data', c => { size += c.length; if (size > MAX_BODY) { res.destroy(); reject(new Error('Master response too large')); } else chunks.push(c); });
        res.on('end', () => { try { const output = JSON.parse(Buffer.concat(chunks).toString()); if (res.statusCode !== 200) reject(Object.assign(new Error(output.error || 'Master unavailable'), { status: res.statusCode })); else resolve(output); } catch (e) { reject(e); } });
      });
      // Validate the pin before sending credentials, not merely after reading a response.
      req.on('socket', socket => socket.once('secureConnect', () => {
        if (!sameSecret(hash(socket.getPeerCertificate().raw), fingerprint.toLowerCase())) { req.destroy(new Error('Master certificate does not match')); return; }
        req.end(JSON.stringify(data));
      }));
      req.setHeader('Content-Type', 'application/json');
      req.setTimeout(8000, () => req.destroy(new Error('Master offline')));
      req.on('error', reject);
    });
  }
  async function join({ address, fingerprint, code, name }) {
    if (enabled) throw new Error('Disable Master sharing before connecting as a viewer');
    const key = crypto.randomBytes(32).toString('hex');
    const result = await request(address, fingerprint, '/view/pair', { code, name, key });
    if (result.schema !== 1) throw new Error('Update both PCs to compatible CodeSync versions');
    saved.viewer = protect({ address, fingerprint: fingerprint.toLowerCase(), id: result.id, key }); persist();
    onViewerMode(); return { status: result.status };
  }
  async function poll() {
    const v = saved.viewer ? reveal(saved.viewer) : null;
    if (!v) return { mode: 'control' };
    try {
      const approval = await request(v.address, v.fingerprint, '/view/pair-status', v);
      if (approval.status !== 'approved') return { mode: 'viewer', status: 'pending' };
      const result = await request(v.address, v.fingerprint, '/view/snapshot', v);
      if (result.schema !== 1) throw new Error('Update both PCs to compatible CodeSync versions');
      return { mode: 'viewer', status: 'approved', ...result };
    } catch (error) { return { mode: 'viewer', status: error.status === 401 ? 'revoked' : 'offline', error: error.message }; }
  }
  async function readHistory(store, offset) {
    const v = saved.viewer ? reveal(saved.viewer) : null;
    if (!v) throw new Error('Not paired');
    return request(v.address, v.fingerprint, '/view/history', { ...v, store, offset });
  }
  async function leave() { const v = saved.viewer ? reveal(saved.viewer) : null; if (v) { try { await request(v.address, v.fingerprint, '/view/leave', v); } catch {} } delete saved.viewer; persist(); return { mode: 'control' }; }
  function publish(input) {
    if (mode() === 'viewer' || !enabled || !validEntitlement()) return;
    snapshot = sanitizeSnapshot(input);
    if (input.history) {
      const next = JSON.stringify(input.history);
      if (next.length > 32 * 1024 * 1024) throw new Error('Reporting history exceeds sharing limit');
      if (hash(next) !== history.digest) history = { ...input.history, revision: history.revision + 1, digest: hash(next) };
    }
  }
  return { mode, info, shouldResume: () => !!saved.sharingEnabled, shutdown: () => stop(true), start, stop, newCode, approve, revoke, authorize, join, poll, readHistory, leave, publish, legacyAllowed: token => mode() !== 'viewer' && sameSecret(token, legacyToken), legacyToken: () => mode() === 'viewer' ? null : legacyToken };
}
module.exports = { createMasterSharing };
