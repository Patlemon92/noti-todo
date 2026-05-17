import { registerSW } from 'virtual:pwa-register';

/**
 * Force-update setup.
 *
 * The service worker already calls skipWaiting() + clients.claim() (see
 * src/pwa/sw.ts), so a new SW activates immediately on install instead of
 * waiting for every tab to close. This file completes the loop on the client:
 *
 * 1. on registration, poll the SW for updates every 60s so we notice new
 *    deploys without the user having to reload manually.
 * 2. when a new SW is found (onNeedRefresh), call updateSW(true) which
 *    instructs the waiting SW to activate (skipWaiting) and reloads the page
 *    so the new bundle takes over.
 * 3. a tiny 'updating…' pill flashes briefly so the user isn't surprised by
 *    the reload.
 */
export function setupPWA() {
  if (typeof window === 'undefined') return;

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      showUpdatingPill();
      // small grace so any in-flight debounced save (600ms in NoteCanvas /
      // 500ms in PageEditor) has a chance to flush before we navigate.
      window.setTimeout(() => {
        updateSW(true);
      }, 800);
    },
    onOfflineReady() {
      // noop — silent
    },
    onRegisteredSW(_swUrl, reg) {
      if (!reg) return;
      // poll every 60s for a new SW
      window.setInterval(() => {
        reg.update().catch(() => {});
      }, 60_000);
      // also poll on tab focus (catches deploys that landed while the
      // tab was backgrounded)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          reg.update().catch(() => {});
        }
      });
    },
  });
}

function showUpdatingPill() {
  if (document.getElementById('noti-update-pill')) return;
  const pill = document.createElement('div');
  pill.id = 'noti-update-pill';
  pill.style.cssText = [
    'position:fixed',
    'bottom:84px',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:200',
    'background:#2a2520',
    'color:#f3ebd9',
    'padding:8px 14px',
    'border-radius:999px',
    'font:600 12px Bricolage Grotesque,system-ui,sans-serif',
    'box-shadow:3px 3px 0 rgba(42,37,32,0.25)',
    'pointer-events:none',
  ].join(';');
  pill.textContent = 'updating…';
  document.body.appendChild(pill);
}
