// Windows ping can exit successfully for a gateway's "destination unreachable"
// reply. Only an echo reply from the requested address establishes reachability.
function hasPingReply(ipAddress, stdout, error, platform = process.platform) {
  if (error) return false;
  if (platform !== 'win32') return true;
  const escapedIp = ipAddress.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:^|\\s)${escapedIp}\\s*:[^\\r\\n]*\\bTTL\\s*[=:]\\s*\\d+`, 'im').test(stdout || '');
}

module.exports = { hasPingReply };