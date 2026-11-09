'use client';

const cache = new Map();
const pending = new Map();
const maxEntries = 40;
let generation = 0;

export function readCachedJson(url) {
  if (!cache.has(url)) return undefined;
  const data = cache.get(url);
  cache.delete(url);
  cache.set(url, data);
  return data;
}

export function hasCachedJson(url) {
  return cache.has(url);
}

export function invalidateJsonCache() {
  generation += 1;
  cache.clear();
  pending.clear();
}

export async function fetchCachedJson(url) {
  const existing = pending.get(url);
  if (existing) return existing;

  const requestGeneration = generation;
  const request = fetch(url, { cache: 'no-store' })
    .then(async response => {
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Unable to load data');
      if (requestGeneration === generation) {
        cache.delete(url);
        cache.set(url, data);
        if (cache.size > maxEntries) cache.delete(cache.keys().next().value);
      }
      return data;
    })
    .finally(() => {
      if (pending.get(url) === request) pending.delete(url);
    });

  pending.set(url, request);
  return request;
}

export async function fetchApi(url, options = {}) {
  const response = await fetch(url, { ...options, cache: 'no-store' });
  if (response.ok && (options.method || 'GET').toUpperCase() !== 'GET') {
    invalidateJsonCache();
  }
  return response;
}
