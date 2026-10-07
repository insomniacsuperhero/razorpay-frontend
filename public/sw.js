/* Service worker: shows dispute alerts as phone notifications and opens the dispute when tapped.
   It does not cache anything, so a new deploy is always picked up on the next load. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Razorpay', body: event.data && event.data.text() }; }
  const title = data.title || 'Dispute alert';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || 'A customer raised a dispute. Tap to respond.',
    icon: '/icon-192.png',
    badge: '/badge-96.png',
    tag: data.tag || 'dispute',
    renotify: true,
    requireInteraction: true,
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === self.location.origin && 'navigate' in w) {
        await w.focus();
        return w.navigate(url);
      }
    }
    return self.clients.openWindow(url);
  })());
});
