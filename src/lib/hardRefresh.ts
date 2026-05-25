/**
 * Nuke the SW + caches, then reload. A plain location.reload() can still
 * serve stale assets from the service-worker cache; this guarantees the next
 * GET goes to the network.
 */
export async function hardRefresh() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } finally {
    window.location.reload();
  }
}
