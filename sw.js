// Keeps the app working with a weak or no signal in the back of the warehouse.
// Bump VERSION whenever you change index.html, app.js or styles so phones pick up the update.
const VERSION = "stockroom-v1";
const CORE = [
  "./",
  "./index.html",
  "./app.js",
  "./config.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js",
  "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js",
  "https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first for the app's own files (so updates show up), cache as the fallback.
// Firebase traffic is never cached here; Firestore has its own offline storage.
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (/googleapis\.com|firebaseio|firestore|identitytoolkit|securetoken/.test(url.host)) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok && (url.origin === location.origin || url.host === "cdn.jsdelivr.net" || url.host.endsWith("gstatic.com"))) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("./index.html")))
  );
});
