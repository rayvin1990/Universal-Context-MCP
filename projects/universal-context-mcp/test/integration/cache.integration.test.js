/**
 * Integration Tests for Universal Context MCP
 * 集成测试
 */

import { expect, describe, it, beforeAll, afterAll } from 'vitest';
import { CacheManager } from '../src/cache/cache-manager.js';
import { InputPipeline } from '../src/input/index.js';

describe('Integration Tests', () => {
  let cacheManager;
  let inputPipeline;

  beforeAll(async () => {
    cacheManager = new CacheManager();
    await cacheManager.initialize();

    inputPipeline = new InputPipeline();
    inputPipeline.setCacheManager(cacheManager);
  });

  afterAll(async () => {
    await cacheManager.clear();
  });

  it('should process input with cache', async () => {
    const result = await inputPipeline.process('Test prompt', {
      projectPath: './test-project',
      sessionId: 'test-session'
    });

    expect(result).toBeDefined();
    expect(result.context).toBeDefined();
  });

  it('should cache and retrieve context', async () => {
    await cacheManager.set('test-key', { content: 'test-content' });
    const cached = await cacheManager.get('test-key');
    
    expect(cached).toBeDefined();
    expect(cached.content).toBe('test-content');
  });

  it('should search similar contexts', async () => {
    await cacheManager.set('search-key', { content: 'hello world' });
    const results = await cacheManager.search('hello');
    
    expect(results.length).toBeGreaterThan(0);
  });
});
