import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

function arrayBufferToBase64Url(buf: ArrayBuffer | null): string {
  if (!buf) return '';
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export type PushSupport =
  | { kind: 'supported' }
  | { kind: 'unsupported'; reason: string };

export function getPushSupport(): PushSupport {
  if (typeof window === 'undefined') {
    return { kind: 'unsupported', reason: 'no window' };
  }
  if (!('serviceWorker' in navigator)) {
    return { kind: 'unsupported', reason: 'service workers not available' };
  }
  if (!('PushManager' in window)) {
    return { kind: 'unsupported', reason: 'push api not available' };
  }
  if (!('Notification' in window)) {
    return { kind: 'unsupported', reason: 'notifications not available' };
  }
  // iOS Safari only supports web push when the site is installed as a PWA.
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !('MSStream' in window);
  // @ts-expect-error iOS-only standalone flag
  const standalone = window.navigator.standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  if (isIOS && !standalone) {
    return {
      kind: 'unsupported',
      reason: 'on iOS, install to home screen first',
    };
  }
  return { kind: 'supported' };
}

export interface SubscriptionResult {
  ok: boolean;
  reason?: string;
}

/**
 * Make sure this device has a push subscription registered for the current
 * user. Idempotent — safe to call before every reminder save. Returns
 * { ok: true } if the subscription is alive, or { ok: false, reason } if
 * the user/browser refused.
 */
export async function ensurePushSubscription(): Promise<SubscriptionResult> {
  const support = getPushSupport();
  if (support.kind === 'unsupported') {
    return { ok: false, reason: support.reason };
  }
  if (!VAPID_PUBLIC_KEY) {
    return { ok: false, reason: 'vapid public key missing in env' };
  }

  if (Notification.permission === 'denied') {
    return { ok: false, reason: 'notifications blocked — change in browser settings' };
  }
  if (Notification.permission === 'default') {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return { ok: false, reason: 'permission denied' };
  }

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    try {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBuffer(VAPID_PUBLIC_KEY),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[push subscribe]', err);
      return { ok: false, reason: 'subscription failed' };
    }
  }

  const key = sub.getKey('p256dh');
  const auth = sub.getKey('auth');
  if (!key || !auth) return { ok: false, reason: 'subscription missing keys' };

  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { ok: false, reason: 'not signed in' };

  // Idempotent: insert if new, skip if the row already exists. Avoids the
  // 403 you'd hit upserting against RLS that doesn't have an UPDATE policy
  // (we don't need to update — endpoint is unique and the keys don't change).
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: arrayBufferToBase64Url(key),
        auth: arrayBufferToBase64Url(auth),
        user_agent: navigator.userAgent.slice(0, 200),
      },
      { onConflict: 'endpoint', ignoreDuplicates: true },
    );

  if (error) {
    // 23505 means we raced and the row exists — that's fine for our purposes.
    if ((error as { code?: string }).code === '23505') return { ok: true };
    // eslint-disable-next-line no-console
    console.error('[push subscribe upsert]', error);
    return { ok: false, reason: error.message };
  }

  return { ok: true };
}

export async function removeThisDeviceSubscription(): Promise<void> {
  const support = getPushSupport();
  if (support.kind === 'unsupported') return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}
