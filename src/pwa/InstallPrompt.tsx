import { useEffect, useState } from 'react';

const DISMISS_KEY = 'noti-todo:install-prompt-dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallPrompt() {
  const [iosPrompt, setIosPrompt] = useState(false);
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (localStorage.getItem(DISMISS_KEY)) return;

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // @ts-expect-error iOS-only flag
      window.navigator.standalone === true;
    if (standalone) return;

    const ua = window.navigator.userAgent;
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
    if (isIOS) {
      setTimeout(() => setIosPrompt(true), 2500);
      return;
    }

    const onBefore = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBefore);
    return () => window.removeEventListener('beforeinstallprompt', onBefore);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setIosPrompt(false);
    setInstallEvent(null);
  }

  if (!iosPrompt && !installEvent) return null;

  return (
    <div className="fixed bottom-[84px] left-1/2 z-[60] w-[calc(100%-28px)] max-w-[420px] -translate-x-1/2 rounded-[14px] border-2 border-ink bg-surface px-3.5 py-2.5 shadow-card">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 font-mono text-[14px] text-coral">↓</span>
        <div className="flex-1">
          <div className="text-[13.5px] font-semibold leading-tight">
            install todo on your home screen
          </div>
          <p className="mt-0.5 text-[12px] leading-snug text-ink-soft">
            {iosPrompt
              ? 'tap the share icon, then "add to home screen". works fully offline.'
              : 'tap install to add it like a native app.'}
          </p>
          {installEvent && (
            <button
              onClick={async () => {
                await installEvent.prompt();
                const { outcome } = await installEvent.userChoice;
                if (outcome === 'accepted' || outcome === 'dismissed') dismiss();
              }}
              className="mt-2 inline-flex rounded-pill border-[1.5px] border-ink bg-ink px-3 py-1 font-mono text-[11px] uppercase tracking-mono text-bg"
            >
              install
            </button>
          )}
        </div>
        <button
          onClick={dismiss}
          aria-label="dismiss"
          className="font-mono text-[14px] text-ink-soft"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
