// experiment/sw.js
const CACHE_NAME = 'mousetracking-app-v3'; 

const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './css/style.css',
    './js/app.js',
    './js/db.js',
    '../shared/config.js', 
    './js/offline.js',
    './js/tracker.js',
    './js/fullscreen.js',
    './manifest.json',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// 1. INSTALACJA (Pobieranie plików na dysk)
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Zapisywanie plików aplikacji do pamięci podręcznej...');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// 2. AKTYWACJA (Czyszczenie starych śmieci)
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log('[Service Worker] Usuwanie starego cache:', key);
                    return caches.delete(key);
                }
            }));
        })
    );
    self.clients.claim();
});

// 3. PRZECHWYTYWANIE ZAPYTAŃ (Logika Offline)
self.addEventListener('fetch', (event) => {
    const requestUrl = event.request.url;

    // A) Logika dla obrazków z bazy (Supabase Storage) - tak jak poprzednio
    if (requestUrl.includes('supabase.co/storage')) {
        event.respondWith(
            caches.match(event.request).then((cachedImage) => {
                if (cachedImage) return cachedImage; // Mamy obrazek na dysku
                return fetch(event.request).then((response) => {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
                    return response;
                }).catch(() => console.log("Brak sieci, nie pobrano obrazka:", requestUrl));
            })
        );
        return;
    }

    // B) Logika dla plików aplikacji (HTML, CSS, JS, biblioteka)
    // Strategia: "Network First, falling back to cache" (Najpierw sieć, potem dysk)
    event.respondWith(
        fetch(event.request).catch(() => {
            // Brak internetu! Szukamy pliku w zapisanym cache.
            return caches.match(event.request);
        })
    );
});