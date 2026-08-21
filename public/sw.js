const CACHE_NAME = "elisa-lima-shell-v1";
const ASSETS_TO_CACHE = ["/icon.svg", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))),
  );
  self.clients.claim();
});

// O app é dinâmico (vendas, estoque, métricas mudam a cada visita), então
// cache agressivo aqui serviria dado desatualizado sem avisar ninguém.
// Este worker só passa a rede adiante — o papel dele é puramente cumprir o
// requisito técnico que faz o Chrome oferecer "Instalar app" sozinho, sem
// nenhum botão nosso ocupando espaço na tela.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
