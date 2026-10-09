// Service worker for the installed app. It keeps a copy of the pages so the
// app opens with no connection, and always prefers a fresh copy when there
// is one. Requests to the server's API are never stored.
const CACHE = "hacknext-v1";
const SHELL = [
  "index.html",
  "student.html",
  "staff.html",
  "coe.html",
  "admin.html",
  "alumni.html",
  "styles.css",
  "app.js",
  "config.js",
  "manifest.webmanifest",
  "images/student.svg",
  "images/staff.svg",
  "images/coe.svg",
  "images/admin.svg",
  "images/alumni.svg",
  "icons/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.includes("/api/")) return;

  // network first, so a change to the pages shows at once; the stored copy
  // is used only when the network fails
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then((stored) => stored || Response.error()))
  );
});
