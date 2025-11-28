const CACHE_NAME = 'smartwallet-v1';
const STATIC_CACHE = 'smartwallet-static-v1';
const DYNAMIC_CACHE = 'smartwallet-dynamic-v1';

// 需要缓存的静态资源
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  // 外部CDN资源
  'https://cdn.tailwindcss.com',
  'https://aistudiocdn.com/uuid@^13.0.0',
  'https://aistudiocdn.com/react@^19.2.0',
  'https://aistudiocdn.com/react@^19.2.0/',
  'https://aistudiocdn.com/lucide-react@^0.555.0',
  'https://aistudiocdn.com/react-dom@^19.2.0/',
  'https://aistudiocdn.com/@google/genai@^1.30.0',
  'https://aistudiocdn.com/recharts@^3.5.0'
];

// 安装事件 - 缓存静态资源
self.addEventListener('install', (event) => {
  console.log('Service Worker: 安装中...');

  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('Service Worker: 缓存静态资源');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// 激活事件 - 清理旧缓存
self.addEventListener('activate', (event) => {
  console.log('Service Worker: 激活中...');

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('Service Worker: 删除旧缓存', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

// 拦截请求事件
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 跳过Chrome扩展请求
  if (url.protocol === 'chrome-extension:') {
    return;
  }

  // 对于导航请求，总是尝试网络，失败时返回缓存
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => {
          return caches.match('/');
        })
    );
    return;
  }

  // 对于静态资源，优先使用缓存
  if (STATIC_ASSETS.some(asset => request.url.includes(asset)) ||
      request.destination === 'script' ||
      request.destination === 'style' ||
      request.destination === 'image') {

    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }

          // 没有缓存，请求网络并缓存
          return fetch(request)
            .then((response) => {
              // 只缓存成功的响应
              if (!response || response.status !== 200 || response.type !== 'basic') {
                return response;
              }

              // 克隆响应，因为响应流只能被读取一次
              const responseToCache = response.clone();

              caches.open(DYNAMIC_CACHE)
                .then((cache) => {
                  cache.put(request, responseToCache);
                });

              return response;
            })
            .catch(() => {
              // 如果是图片请求失败，返回默认图标
              if (request.destination === 'image') {
                return new Response(
                  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 17L12 22L22 17" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 12L12 17L22 12" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
                  {
                    headers: { 'Content-Type': 'image/svg+xml' }
                  }
                );
              }
            });
        })
    );
    return;
  }

  // 对于API请求，尝试网络，失败时返回缓存的响应
  if (url.pathname.includes('/api/') || request.url.includes('genai')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // 缓存成功的API响应
          if (response.ok) {
            const responseToCache = response.clone();
            caches.open(DYNAMIC_CACHE)
              .then((cache) => {
                cache.put(request, responseToCache);
              });
          }
          return response;
        })
        .catch(() => {
          // 网络失败，尝试返回缓存的API响应
          return caches.match(request);
        })
    );
    return;
  }

  // 其他请求，直接走网络
  event.respondWith(fetch(request));
});

// 消息处理 - 用于缓存更新
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CACHE_UPDATE') {
    // 更新特定资源缓存
    caches.open(DYNAMIC_CACHE)
      .then((cache) => {
        return cache.add(event.data.url);
      })
      .catch(() => {
        console.log('缓存更新失败:', event.data.url);
      });
  }
});

// 后台同步（如果支持）
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(
      // 这里可以执行后台数据同步
      console.log('执行后台同步')
    );
  }
});

// 推送通知（如果需要）
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();

    const options = {
      body: data.body || '您有新的财务提醒',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        primaryKey: data.primaryKey || 1
      },
      actions: [
        {
          action: 'explore',
          title: '查看详情',
          icon: '/icons/icon-96x96.png'
        },
        {
          action: 'close',
          title: '关闭',
          icon: '/icons/icon-96x96.png'
        }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'SmartWallet提醒', options)
    );
  }
});

// 通知点击处理
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'explore') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});