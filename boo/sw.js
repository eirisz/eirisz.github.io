// Boo's offline worker: keeps the app's own files so Boo opens without a network,
// and serves pictures in notes (boo-image/...), which the page reads from your
// folders or from Boo's storage in the browser.
const VERSION = '6.0.0-59053dc722';
const CACHE = `boo-${VERSION}`;
const FILES = ["./","boo.js","dialogs.js","emoji.js","goto.js","guide.js","icons.js","icons/apple-touch-icon.png","icons/favicon-32.png","icons/icon-192.png","icons/icon-512.png","icons/icon-maskable-512.png","index.html","lib/pixelpals.js","manifest.webmanifest","mobile.css","platform-web.js","reminders.js","renderer.js","rich-notes.js","rich.css","search-view.js","services.js","sidebar.js","styles.css","sync.js","tags-view.js","templates.js","themes.css","vendor/editor.js","vendor/rich.js","vendor/web-worker.js","web.css"];
const BASE = new URL('./', self.location).href;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES.map((file) => new Request(`${BASE}${file}`, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith('boo-') && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});

const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif', svg: 'image/svg+xml' };

async function image(request, path) {
  const extension = path.split('.').pop().toLowerCase();
  if (!TYPES[extension]) return new Response('Not an image', { status: 404 });
  const client = (await self.clients.get(request.clientId ?? '')) ?? (await self.clients.matchAll({ type: 'window' }))[0];
  if (!client) return new Response('Boo is closed', { status: 404 });
  const blob = await new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = ({ data }) => resolve(data.blob);
    client.postMessage({ type: 'read', path }, [channel.port2]);
    setTimeout(() => resolve(null), 20000);
  });
  if (!blob) return new Response('Image not found', { status: 404 });
  return new Response(blob, { headers: { 'Content-Type': TYPES[extension], 'Cache-Control': 'no-store' } });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(BASE)) return;
  const url = new URL(request.url);
  const imagePrefix = new URL('boo-image/', BASE).pathname;
  if (url.pathname.startsWith(imagePrefix)) {
    event.respondWith(image(request, `/${decodeURIComponent(url.pathname.slice(imagePrefix.length))}`));
    return;
  }
  // The newest version when online; the kept copy when not.
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok && url.search === '') (await caches.open(CACHE)).put(request, response.clone());
      return response;
    } catch {
      return (await caches.match(request, { ignoreSearch: true })) ?? Response.error();
    }
  })());
});

// Clicking a reminder brings Boo forward.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const [client] = await self.clients.matchAll({ type: 'window' });
    if (client) return client.focus();
    return self.clients.openWindow(BASE);
  })());
});
