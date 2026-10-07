var urlsToCache = [
	'.',
	'timer.php',
	'js/cstimer.js',
	'js/twisty.js',
	'js/jlthemes.js',
	'js/jlfx.js',
	'js/jquery.min.js',
	'css/style.css'
];

var langUrlRe = /^(.*(\/|timer.php))\?lang=.*$/;

self.addEventListener('install', function(event) {
	self.skipWaiting();
	event.waitUntil(
		caches.open(CACHE_NAME)
		.then(function(cache) {
			return cache.addAll(urlsToCache);
		})
	);
});

self.addEventListener('fetch', function(event) {
	event.respondWith(
		caches.match(event.request)
		.then(function(response) {
			if (response) {
				return response;
			}
			return fetch(event.request).then(function(response) {
				if (langUrlRe.exec(event.request.url)) {
					caches.open(CACHE_NAME).then(function(cache) {
						cache.put(langUrlRe.exec(event.request.url)[1], response);
					});
				}
				return response.clone();
			});
		})
	);
});

self.addEventListener('activate', function(event) {
	event.waitUntil(
		caches.keys().then(function(cacheNames) {
			return Promise.all(
				cacheNames.map(function(cacheName) {
					if (cacheName != CACHE_NAME) {
						return caches.delete(cacheName);
					}
				})
			);
		})
	);
});

var CACHE_NAME = "jltimer_cache_abc040c50b16804101b75415788540ed";
