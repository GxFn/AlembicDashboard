/**
 * Service Worker - 处理离线支持和缓存策略
 * 将此文件放在 public 目录：public/service-worker.js
 */

const CACHE_NAME = 'alembic-static-v2';
const DYNAMIC_CACHE = 'alembic-runtime-v2';
const ASSETS_TO_CACHE = [
  '/manifest.json',
  '/favicon.ico',
];

// 安装事件 - 缓存关键资源
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching app shell');
      return cache.addAll(ASSETS_TO_CACHE).catch((error) => {
        console.log('[Service Worker] Error caching assets:', error);
        // 不要在安装失败时抛出错误
      });
    })
  );
  self.skipWaiting();
});

// 激活事件 - 清理旧缓存
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME && cacheName !== DYNAMIC_CACHE)
          .map((cacheName) => {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          })
      );
    })
  );
  self.clients.claim();
});

// 获取事件 - 入口 HTML 和 API 永远优先取网络，避免旧 Dashboard bundle 长期滞留。
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 忽略非 GET 请求
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isNavigation =
    request.mode === 'navigate' || (isSameOrigin && (url.pathname === '/' || url.pathname === '/index.html'));

  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put('/index.html', responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match('/index.html').then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            return fetch('/index.html');
          });
        })
    );
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(
          JSON.stringify({
            success: false,
            error: {
              code: 'OFFLINE',
              message: 'You are currently offline. Some data may be unavailable.',
            },
          }),
          {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'application/json',
            }),
          }
        );
      })
    );
    return;
  }

  if (isSameOrigin) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const networkResponse = fetch(request).then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        });
        return cachedResponse || networkResponse;
      })
    );
  } else {
    event.respondWith(fetch(request));
  }
});

// 后台同步（示例）
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    event.waitUntil(
      // 同步待上传的数据
      console.log('[Service Worker] Syncing data...')
    );
  }
});

console.log('[Service Worker] Loaded');
