const IMAGE_CACHE = 'lmc-images-v1';
const IMAGE_META_CACHE = 'lmc-images-meta-v1';
const IMAGE_CACHE_PREFIX = 'lmc-images-';
const IMAGE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_IMAGE_ENTRIES = 160;

self.addEventListener('install', event => {
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names
            .filter(name => name.startsWith(IMAGE_CACHE_PREFIX) && ![IMAGE_CACHE, IMAGE_META_CACHE].includes(name))
            .map(name => caches.delete(name)));
        await self.clients.claim();
    })());
});

function metadataRequest(imageUrl) {
    return new Request(`${self.location.origin}/__lmc_image_cache_meta__?url=${encodeURIComponent(imageUrl)}`);
}

async function readCachedAt(metaCache, imageUrl) {
    const response = await metaCache.match(metadataRequest(imageUrl));
    if (!response) return 0;
    const value = Number(await response.text());
    return Number.isFinite(value) ? value : 0;
}

async function trimImageCache(imageCache, metaCache) {
    const keys = await imageCache.keys();
    const excess = keys.length - MAX_IMAGE_ENTRIES;
    if (excess <= 0) return;
    await Promise.all(keys.slice(0, excess).flatMap(request => [
        imageCache.delete(request),
        metaCache.delete(metadataRequest(request.url))
    ]));
}

async function cacheImage(request) {
    const [imageCache, metaCache] = await Promise.all([
        caches.open(IMAGE_CACHE),
        caches.open(IMAGE_META_CACHE)
    ]);
    const cached = await imageCache.match(request);
    const cachedAt = cached ? await readCachedAt(metaCache, request.url) : 0;

    if (cached && Date.now() - cachedAt < IMAGE_TTL_MS) return cached;

    try {
        const response = await fetch(request);
        if (response.ok || response.type === 'opaque') {
            await Promise.all([
                imageCache.delete(request),
                metaCache.delete(metadataRequest(request.url))
            ]);
            await Promise.all([
                imageCache.put(request, response.clone()),
                metaCache.put(metadataRequest(request.url), new Response(String(Date.now())))
            ]);
            await trimImageCache(imageCache, metaCache);
        }
        return response;
    } catch (error) {
        if (cached) return cached;
        throw error;
    }
}

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET' || request.destination !== 'image') return;
    const url = new URL(request.url);
    if (!['http:', 'https:'].includes(url.protocol)) return;
    event.respondWith(cacheImage(request));
});
