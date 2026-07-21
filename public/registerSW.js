// Legacy CodeSync PWA unregister shim.
// Older published builds load /registerSW.js and then register /sw.js. Keep
// this file present so those stale HTML shells update themselves into the
// current no-cache build instead of installing another app-shell worker.
(function () {
  async function clearStaleState() {
    if (!('serviceWorker' in navigator)) return false;

    let hadStaleState = Boolean(navigator.serviceWorker.controller);

    try {
      await navigator.serviceWorker.register('/sw.js?cs_kill=' + Date.now(), { scope: '/' });
    } catch (_) {}

    try {
      var registrations = await navigator.serviceWorker.getRegistrations();
      hadStaleState = hadStaleState || registrations.length > 0;
      await Promise.all(registrations.map(function (registration) {
        return registration.unregister();
      }));
    } catch (_) {}

    try {
      if ('caches' in window) {
        var keys = await caches.keys();
        hadStaleState = hadStaleState || keys.length > 0;
        await Promise.all(keys.map(function (key) { return caches.delete(key); }));
      }
    } catch (_) {}

    return hadStaleState;
  }

  if (!('serviceWorker' in navigator) || navigator.userAgent.includes('Electron')) return;

  window.addEventListener('load', function () {
    clearStaleState().then(function (hadStaleState) {
      if (!hadStaleState || location.search.indexOf('cs_cache_reset=') !== -1) return;
      var url = new URL(location.href);
      url.searchParams.set('cs_cache_reset', String(Date.now()));
      location.replace(url.href);
    }).catch(function () {});
  });
})();