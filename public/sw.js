// CodeSync stale-cache kill switch.
// If an older preview/published build registered an app-shell service worker,
// this replacement clears app-shell caches for this scope and then unregisters
// itself so future visits are served directly from the network.
function isWorkboxCacheForThisRegistration(name) {
  const hasWorkboxBucket = /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-/.test(name);
  return hasWorkboxBucket && name.endsWith(self.registration.scope);
}

function isLovablePreviewHost() {
  const host = self.location.hostname;
  return host === "lovableproject.com"
    || host.endsWith(".lovableproject.com")
    || host === "lovableproject-dev.com"
    || host.endsWith(".lovableproject-dev.com")
    || host === "lovable.app"
    || host.endsWith(".lovable.app")
    || host.startsWith("id-preview--")
    || host.startsWith("preview--");
}

function isCodeSyncAppCache(name) {
  return isWorkboxCacheForThisRegistration(name)
    || /workbox|precache|runtime|codesync|vite|app-shell/i.test(name);
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        const staleCacheNames = isLovablePreviewHost()
          ? cacheNames
          : cacheNames.filter(isCodeSyncAppCache);
        await Promise.allSettled(staleCacheNames.map((name) => caches.delete(name)));
        await self.clients.claim();
        const windowClients = await self.clients.matchAll({ type: "window" });
        await Promise.allSettled(windowClients.map((client) => {
          const url = new URL(client.url);
          url.searchParams.set("cs_cache_reset", String(Date.now()));
          return client.navigate(url.href);
        }));
      } finally {
        await self.registration.unregister();
      }
    })(),
  ),
);