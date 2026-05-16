import { registerSW } from 'virtual:pwa-register';

export function setupPWA() {
  if (typeof window === 'undefined') return;
  registerSW({
    immediate: true,
    onNeedRefresh() {
      // gentle refresh prompt — append a tiny pill that calls updateSW
      const banner = document.createElement('div');
      banner.style.cssText = [
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
        'cursor:pointer',
      ].join(';');
      banner.textContent = 'update available — tap to reload';
      banner.onclick = () => window.location.reload();
      document.body.appendChild(banner);
    },
  });
}
