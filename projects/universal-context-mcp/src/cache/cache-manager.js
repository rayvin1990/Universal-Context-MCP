/**
 * Cache manager that coordinates the fast LRU layer and the longer-lived vector store.
 */

import { buildCacheKey } from './cache-entry.js';
import { LRUCache } from './lru-cache.js';
import { VectorStore } from './vector-store.js';

const DEFAULT_OPTIONS = {
  lru: {
    maxEntries: 100,
    maxSizeBytes: 5 * 1024 * 1024,
    ttlMs: 60 * 60 * 1000,
    negativeTtlMs: 60 * 1000,
    ttlJitterRatio: 0.1,
  },
  vector: {
    enabled: true,
    backend: 'file',  // 持久化存储
    endpoint: 'http://localhost:8000',
    collectionName: 'universal-context',
  },
};

function mergeOptions(base, overrides = {}) {
  return {
    ...base,
    ...overrides,
    lru: {
      ...base.lru,
      ...(overrides.lru || {}),
    },
    vector: {
      ...base.vector,
      ...(overrides.vector || {}),
    },
  };
}

function normalizeScope(scope = {}) {
  return {
    agent: scope.agent,
    project: scope.project,
    sessionId: scope.sessionId,
  };
}

function normalizePayload(value, options = {}) {
  const metadata = {
    ...(options.metadata || {}),
    ...(options.scope || {}),
    cacheKey: options.cacheKey,
    source: options.source || 'cache-manager',
  };

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return {
      ...value,
      metadata: {
        ...(value.metadata || {}),
        ...metadata,
      },
    };
  }

  return {
    content: value,
    metadata,
  };
}

export class CacheManager {
  constructor(options = {}) {
    this.options = mergeOptions(DEFAULT_OPTIONS, options);
    this.lruCache = new LRUCache(this.options.lru);
    this.vectorStore = new VectorStore(this.options.vector);
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    if (this.options.vector.enabled) {
      await this.vectorStore.initialize();
    }

    this.initialized = true;
  }

  buildKey(identifier, scope = {}) {
    return buildCacheKey(identifier, normalizeScope(scope));
  }

  async get(identifier, options = {}) {
    await this.initialize();

    const scope = normalizeScope(options.scope || options);
    const key = options.key || this.buildKey(identifier, scope);
    const cached = this.lruCache.get(key);

    if (cached !== null) {
      return cached;
    }

    if (!this.options.vector.enabled) {
      return null;
    }

    const fallback = await this.vectorStore.get(key);
    if (!fallback) {
      return null;
    }

    this.lruCache.set(key, fallback, {
      scope,
      ttlMs: options.ttlMs,
      cacheType: options.cacheType,
      size: options.size,
    });

    return fallback;
  }

  async getOrSet(identifier, loader, options = {}) {
    await this.initialize();

    const scope = normalizeScope(options.scope || options);
    const key = options.key || this.buildKey(identifier, scope);

    return this.lruCache.getOrSet(
      key,
      async () => {
        const existing = this.options.vector.enabled ? await this.vectorStore.get(key) : null;
        if (existing !== null) {
          return existing;
        }

        const value = await loader();
        if (value === null || value === undefined) {
          return null;
        }

        if (this.options.vector.enabled) {
          await this.vectorStore.add([
            {
              id: key,
              text: options.text || identifier,
              value,
              metadata: {
                ...(options.metadata || {}),
                ...scope,
                cacheType: options.cacheType || 'session-context',
              },
            },
          ]);
        }

        return value;
      },
      {
        scope,
        ttlMs: options.ttlMs,
        negativeTtlMs: options.negativeTtlMs,
        ttlJitterRatio: options.ttlJitterRatio,
        cacheErrors: options.cacheErrors,
        errorTtlMs: options.errorTtlMs,
        cacheType: options.cacheType,
        size: options.size,
      }
    );
  }

  async set(identifier, value, options = {}) {
    await this.initialize();

    const scope = normalizeScope(options.scope || options);
    const key = options.key || this.buildKey(identifier, scope);

    this.lruCache.set(key, value, {
      scope,
      ttlMs: options.ttlMs,
      ttlJitterRatio: options.ttlJitterRatio,
      cacheType: options.cacheType,
      size: options.size,
    });

    if (this.options.vector.enabled) {
      await this.vectorStore.add([
        {
          id: key,
          text: options.text || identifier,
          value,
          metadata: {
            ...(options.metadata || {}),
            ...scope,
            cacheType: options.cacheType || 'session-context',
          },
        },
      ]);
    }

    return key;
  }

  async search(query, options = {}) {
    await this.initialize();

    if (!this.options.vector.enabled) {
      return [];
    }

    return this.vectorStore.search(query, options);
  }

  async delete(identifier, options = {}) {
    await this.initialize();

    const scope = normalizeScope(options.scope || options);
    const key = options.key || this.buildKey(identifier, scope);

    this.lruCache.delete(key);
    await this.vectorStore.delete([key]);
  }

  async clear() {
    await this.initialize();
    this.lruCache.clear();
    await this.vectorStore.clear();
  }

  getStats() {
    return {
      ...this.lruCache.getStats(),
      vector: this.vectorStore.getStats(),
    };
  }

  getVectorStore() {
    return this.vectorStore;
  }

  createDocumentPayload(identifier, value, options = {}) {
    const scope = normalizeScope(options.scope || options);
    const key = options.key || this.buildKey(identifier, scope);
    return normalizePayload(value, {
      ...options,
      scope,
      cacheKey: key,
    });
  }
}

export default CacheManager;
