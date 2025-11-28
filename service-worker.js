// Basic Service Worker for PWA
const CACHE_NAME = 'newsbrief-ai-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Simple pass-through strategy
  // In a real production app, we would cache assets here.
  event.respondWith(fetch(event.request));
});