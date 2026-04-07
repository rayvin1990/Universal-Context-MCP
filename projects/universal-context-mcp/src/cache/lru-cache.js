/**
 * LRU cache for session context.
 * Uses a Map to preserve access order and adds TTL / negative cache / single-flight protection.
 */

import {
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_NEGATIVE_TTL_MS,
  DEFAULT_TTL_JITTER_RATIO,
  applyTTLJitter,
  createCacheEntry,
  isExpired,
  isNegativeEntry,
  refreshCacheEntry,
  touchCacheEntry,
} from './cache-entry.js';

const DEFAULT_OPTIONS = {
  maxEntries: 100,
  maxSizeBytes: 5 * 1024 * 1024,
  ttlMs: DEFAULT_CACHE_TTL_MS,
  negativeTtlMs: DEFAULT_NEGATIVE_TTL_MS,
  ttlJitterRatio: DEFAULT_TTL_JITTER_RATIO,
};

export class LRUCache {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.cache = new Map();
    this.inflightLoads = new Map();
    this.currentSizeBytes = 0;
    this.stats = {
      hits: 0,
      misses: 0,
      negativeHits: 0,
      evictions: 0,
      expirations: 0,
      dedupedLoads: 0,
      entries: 0,
      sizeBytes: 0,
      hitRate: 0,
    };
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      this.#recordMiss();
      return null;
    }

    if (isExpired(entry)) {
      this.#deleteInternal(key, 'expired');
      this.#recordMiss();
      return null;
    }

    this.#promote(key, entry);

    if (isNegativeEntry(entry)) {
      this.stats.negativeHits += 1;
      this.#updateHitRate();
      return null;
    }

    this.stats.hits += 1;
    this.#updateHitRate();
    return entry.value;
  }

  peek(key) {
    const entry = this.cache.get(key);
    if (!entry || isExpired(entry)) {
      return null;
    }
    return entry;
  }

  getEntry(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    if (isExpired(entry)) {
      this.#deleteInternal(key, 'expired');
      return null;
    }

    this.#promote(key, entry);
    return entry;
  }

  set(key, value, options = {}) {
    const ttlMs = applyTTLJitter(
      options.ttlMs ?? this.options.ttlMs,
      options.ttlJitterRatio ?? this.options.ttlJitterRatio
    );

    const existing = this.cache.get(key);
    if (existing) {
      this.currentSizeBytes -= existing.size;
      refreshCacheEntry(existing, value, { ...options, ttlMs });
      this.cache.delete(key);
      this.cache.set(key, existing);
      this.currentSizeBytes += existing.size;
      this.#reconcile();
      return existing;
    }

    const entry = createCacheEntry(key, value, {
      ...options,
      ttlMs,
      negative: Boolean(options.negative),
    });

    this.cache.set(key, entry);
    this.currentSizeBytes += entry.size;
    this.#reconcile();
    return entry;
  }

  setNegative(key, options = {}) {
    const ttlMs = applyTTLJitter(
      options.ttlMs ?? this.options.negativeTtlMs,
      options.ttlJitterRatio ?? this.options.ttlJitterRatio ?? 0
    );

    return this.set(key, null, {
      ...options,
      ttlMs,
      negative: true,
    });
  }

  async getOrSet(key, loader, options = {}) {
    const cached = this.get(key);
    if (cached !== null) {
      return cached;
    }

    const liveEntry = this.peek(key);
    if (liveEntry && isNegativeEntry(liveEntry)) {
      return null;
    }

    if (this.inflightLoads.has(key)) {
      this.stats.dedupedLoads += 1;
      return this.inflightLoads.get(key);
    }

    const loadPromise = (async () => {
      try {
        const value = await loader();
        if (value === null || value === undefined) {
          this.setNegative(key, options);
          return null;
        }

        this.set(key, value, options);
        return value;
      } catch (error) {
        if (options.cacheErrors) {
          this.setNegative(key, {
            ...options,
            ttlMs: options.errorTtlMs ?? this.options.negativeTtlMs,
          });
        }
        throw error;
      } finally {
        this.inflightLoads.delete(key);
      }
    })();

    this.inflightLoads.set(key, loadPromise);
    return loadPromise;
  }

  has(key) {
    return this.peek(key) !== null;
  }

  delete(key) {
    return this.#deleteInternal(key, 'deleted');
  }

  clear() {
    this.cache.clear();
    this.inflightLoads.clear();
    this.currentSizeBytes = 0;
    this.stats.entries = 0;
    this.stats.sizeBytes = 0;
  }

  pruneExpired() {
    for (const [key, entry] of this.cache.entries()) {
      if (isExpired(entry)) {
        this.#deleteInternal(key, 'expired');
      }
    }
  }

  keys() {
    return Array.from(this.cache.keys());
  }

  values() {
    return Array.from(this.cache.values());
  }

  get size() {
    return this.cache.size;
  }

  getStats() {
    return {
      ...this.stats,
      entries: this.cache.size,
      sizeBytes: this.currentSizeBytes,
    };
  }

  #promote(key, entry) {
    touchCacheEntry(entry);
    this.cache.delete(key);
    this.cache.set(key, entry);
  }

  #recordMiss() {
    this.stats.misses += 1;
    this.#updateHitRate();
  }

  #reconcile() {
    this.pruneExpired();

    while (this.cache.size > this.options.maxEntries) {
      this.#evictOldest();
    }

    while (this.currentSizeBytes > this.options.maxSizeBytes && this.cache.size > 0) {
      this.#evictOldest();
    }

    this.stats.entries = this.cache.size;
    this.stats.sizeBytes = this.currentSizeBytes;
  }

  #evictOldest() {
    const oldestKey = this.cache.keys().next().value;
    if (oldestKey) {
      this.#deleteInternal(oldestKey, 'evicted');
    }
  }

  #deleteInternal(key, reason) {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    this.cache.delete(key);
    this.currentSizeBytes = Math.max(0, this.currentSizeBytes - entry.size);

    if (reason === 'expired') {
      this.stats.expirations += 1;
    }
    if (reason === 'evicted') {
      this.stats.evictions += 1;
    }

    this.stats.entries = this.cache.size;
    this.stats.sizeBytes = this.currentSizeBytes;
    return true;
  }

  #updateHitRate() {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }
}

export default LRUCache;
