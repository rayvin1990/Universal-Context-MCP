/**
 * Unit Tests for Universal Context MCP
 * 单元测试
 */

import { expect, describe, it } from 'vitest';
import { CacheManager } from '../src/cache/cache-manager.js';
import { VectorStore } from '../src/cache/vector-store.js';
import { LRUCache } from '../src/cache/lru-cache.js';

describe('CacheManager', () => {
  let cacheManager;

  beforeEach(() => {
    cacheManager = new CacheManager({
      lru: { maxEntries: 10 },
      vector: { enabled: false }
    });
  });

  it('should initialize', async () => {
    await cacheManager.initialize();
    expect(cacheManager.initialized).toBe(true);
  });

  it('should set and get cache', async () => {
    await cacheManager.initialize();
    await cacheManager.set('key1', 'value1');
    const result = await cacheManager.get('key1');
    expect(result).toBe('value1');
  });

  it('should clear cache', async () => {
    await cacheManager.initialize();
    await cacheManager.set('key1', 'value1');
    await cacheManager.clear();
    const result = await cacheManager.get('key1');
    expect(result).toBe(null);
  });
});

describe('VectorStore', () => {
  let vectorStore;

  beforeEach(() => {
    vectorStore = new VectorStore({ backend: 'memory' });
  });

  it('should initialize', async () => {
    await vectorStore.initialize();
    expect(vectorStore.isAvailable()).toBe(true);
  });

  it('should add and search', async () => {
    await vectorStore.initialize();
    await vectorStore.add([
      { id: '1', text: 'hello world', value: { content: 'hello' } }
    ]);
    const results = await vectorStore.search('hello');
    expect(results.length).toBeGreaterThan(0);
  });
});

describe('LRUCache', () => {
  let lruCache;

  beforeEach(() => {
    lruCache = new LRUCache({ maxEntries: 10 });
  });

  it('should set and get', () => {
    lruCache.set('key1', 'value1');
    expect(lruCache.get('key1')).toBe('value1');
  });

  it('should evict oldest', () => {
    for (let i = 0; i < 15; i++) {
      lruCache.set(`key${i}`, `value${i}`);
    }
    expect(lruCache.size).toBe(10);
    expect(lruCache.get('key0')).toBe(null); // Should be evicted
  });
});
