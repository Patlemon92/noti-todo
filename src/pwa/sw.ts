/// <reference lib="webworker" />
/* eslint-disable no-restricted-globals */

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

// ----- precache the app shell -----
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// ----- runtime caching -----
registerRoute(
  ({ url }) => url.hostname.endsWith('.supabase.co'),
  new NetworkFirst({
    cacheName: 'supabase-api',
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 }),
    ],
  }),
);

registerRoute(
  ({ url }) =>
    url.hostname === 'fonts.googleapis.com' ||
    url.hostname === 'fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 30,
        maxAgeSeconds: 60 * 60 * 24 * 365,
      }),
    ],
  }),
);

// ----- service worker lifecycle -----
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ============================================================================
// push notifications
// ============================================================================
//
// Payload shape (from the push-reminders edge function):
//   {
//     title: string,
//     body: string,
//     page_id: string,
//     action_id?: string,
//     tag?: string
//   }
//
// We open /page/:id on click. If the app's already open with that page focused,
// we just focus it.

interface PushPayload {
  title?: string;
  body?: string;
  page_id?: string;
  action_id?: string;
  tag?: string;
}

self.addEventListener('push', (event) => {
  let payload: PushPayload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { title: 'reminder', body: event.data?.text() ?? '' };
  }

  const title = payload.title || 'reminder';
  const body = payload.body || '';
  const tag = payload.tag || payload.action_id || payload.page_id || 'noti-todo';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag,
      renotify: true,
      requireInteraction: false,
      data: {
        page_id: payload.page_id,
        action_id: payload.action_id,
      },
    } as NotificationOptions),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = (event.notification.data ?? {}) as {
    page_id?: string;
    action_id?: string;
  };
  const target = data.page_id ? `/page/${data.page_id}` : '/focus';

  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of all) {
        const url = new URL(client.url);
        if (url.pathname === target) {
          await client.focus();
          return;
        }
      }
      // No matching tab open — open one.
      if (self.clients.openWindow) {
        await self.clients.openWindow(target);
      }
    })(),
  );
});
