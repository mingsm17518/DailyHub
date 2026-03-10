// Service Worker for PWA support

const CACHE_NAME = 'calendar-app-v38';
const STATIC_CACHE = [
    '/',
    '/index.html',
    '/css/style.css',
    '/js/utils.js',
    '/js/todolist.js',
    '/js/backup.js',
    '/js/storage.js',
    '/js/calendar.js',
    '/js/app.js',
    '/manifest.json'
];

// 安装Service Worker
self.addEventListener('install', (event) => {
    // 跳过等待，立即激活新的 Service Worker
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(STATIC_CACHE.map(url => {
                    return new Request(url, { cache: 'reload' });
                }));
            })
    );
});

// 激活Service Worker
self.addEventListener('activate', (event) => {
    // 立即控制所有客户端
    event.waitUntil(
        Promise.all([
            // 清除旧缓存
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(cacheName => cacheName !== CACHE_NAME)
                        .map(cacheName => caches.delete(cacheName))
                );
            }),
            // 立即控制所有客户端
            self.clients.claim()
        ])
    );
});

// 拦截网络请求
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then(response => {
                return response || fetch(event.request);
            })
    );
});
