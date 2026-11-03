// App-shell cache so the app opens fast on a weak garage signal (PRD perf targets).
// Data (/api) always comes from the network: stale stock counts would be worse than slow ones.
const CACHE = "snt-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const put = (req, res) => caches.open(CACHE).then((c) => c.put(req, res));

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (e.request.mode === "navigate") {
    // Network first so a new version shows up right away; the cached shell if offline or very slow.
    const network = fetch(e.request).then((res) => {
      if (res.ok) put("/", res.clone());
      return res;
    });
    const fallback = new Promise((resolve) => setTimeout(resolve, 4000)).then(() => caches.match("/"));
    e.respondWith(
      Promise.race([network, fallback]).then((res) => res || network).catch(() => caches.match("/")),
    );
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    // Hashed filenames never change: cache first.
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            if (res.ok) put(e.request, res.clone());
            return res;
          }),
      ),
    );
  }
});
