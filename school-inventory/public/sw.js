/* Service worker «Школьный инвентарь».
 * Кэшируются ТОЛЬКО статические файлы сборки и иконки. Данные школы, API,
 * HTML-страницы, этикетки и вложения не кэшируются никогда — чтобы на
 * потерянном или заблокированном устройстве не оставалось сведений об имуществе. */
const VERSION = 'v5'
const STATIC = 'si-static-' + VERSION
const PRECACHE = ['/offline.html', '/icons/icon-192.png', '/icons/icon-512.png']
self.addEventListener('install', (e) => {
	e.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)))
	self.skipWaiting()
})
self.addEventListener('activate', (e) => {
	e.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== STATIC).map((k) => caches.delete(k))))
			.then(() => self.clients.claim()),
	)
})
self.addEventListener('fetch', (e) => {
	const req = e.request
	if (req.method !== 'GET') return
	const url = new URL(req.url)
	if (url.origin !== location.origin) return
	if (req.mode === 'navigate') {
		e.respondWith(fetch(req).catch(() => caches.match('/offline.html')))
		return
	}
	if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
		e.respondWith(
			caches.match(req).then(
				(hit) =>
					hit ||
					fetch(req).then((res) => {
						if (res.ok) {
							const copy = res.clone()
							caches.open(STATIC).then((c) => c.put(req, copy))
						}
						return res
					}),
			),
		)
	}
	// Всё остальное (API, вложения, этикетки) — только сеть, без кэша.
})
