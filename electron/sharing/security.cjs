const crypto = require('crypto');
function isLanAddress(value) {
  if (typeof value !== 'string') return false;
  const parts = value.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n, i) => !/^\d{1,3}$/.test(value.split('.')[i]) || n < 0 || n > 255)) return false;
  return parts[0] === 10 || (parts[0] === 192 && parts[1] === 168) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
}
function sameSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function canAccess(role, method, route) {
  return role === 'viewer' && method === 'POST' && ['/view/snapshot', '/view/history', '/view/leave'].includes(route);
}
function isFresh(at, now = Date.now()) { return Number.isFinite(at) && at <= now + 5000 && now - at <= 15000; }
const printerFields = ['id', 'name', 'ipAddress', 'port', 'isAvailable', 'isConnected', 'status', 'hasActiveErrors', 'inkLevel', 'makeupLevel', 'currentMessage', 'printCount', 'jetRunning', 'printerModel', 'printerVariant'];
const metricFields = ['powerHours','streamHours','modulation','viscosity','charge','pressure','rps','phaseQual','hvDeflection','inkLevel','makeupLevel','printStatus','allowErrors','errorActive','printheadTemp','electronicsTemp'];
function pick(source, keys) { return Object.fromEntries(keys.filter(k => source && Object.hasOwn(source, k)).map(k => [k, source[k]])); }
function sanitizeSnapshot(input) {
  const printers = Array.isArray(input?.printers) ? input.printers.slice(0, 500).map(p => pick(p, printerFields)) : [];
  const metrics = {};
  for (const p of printers) {
    const reading = input?.metrics?.[p.id];
    if (reading && Number.isFinite(reading.observedAt)) metrics[p.id] = { observedAt: reading.observedAt, values: pick(reading.values, metricFields) };
  }
  return { schema: 1, observedAt: Date.now(), printers, metrics };
}
module.exports = { isLanAddress, sameSecret, hash, canAccess, isFresh, sanitizeSnapshot };
