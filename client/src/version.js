export const APP_VERSION = __APP_VERSION__;
export const APP_REVISION = __APP_REVISION__;
export const APP_RELEASE = `v${APP_VERSION} · build ${APP_REVISION}`;

export async function clearAppCacheAndRefresh() {
  if ("caches" in window) {
    const cacheNames = await window.caches.keys();
    await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
  }

  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }

  const refreshUrl = new URL(window.location.href);
  refreshUrl.searchParams.set("refresh", `${APP_VERSION}-${Date.now()}`);
  window.location.replace(refreshUrl.toString());
}
