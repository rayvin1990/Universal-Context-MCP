# UC-MCP-003 缓存层模块设计

**版本：** v0.1  
**日期：** 2026-03-28  
**状态：** 开发中

---

## 1. 模块职责

缓存层负责存储和检索上下文数据，分为两个子模块：

| 子模块 | 用途 | 存储内容 |
|--------|------|----------|
| **Vector Store** | 语义相似性检索 | 代码片段、文档、决策记录 |
| **LRU Cache** | 快速访问最近上下文 | 当前会话的完整上下文 |

---

## 2. 接口设计（参考 DESIGN.md）

```typescript
interface CacheStrategy {
  // 写入策略
  shouldCache(context: Context): boolean;
  
  // 读取策略
  getCached(query: string): Promise<Context | null>;
  
  // 过期策略
  shouldExpire(entry: CacheEntry): boolean;
}

interface CacheEntry {
  key: string;
  value: Context;
  ttl: number;        // 过期时间戳
  metadata: {
    agent: string;
    project: string;
    sessionId: string;
    createdAt: number;
    accessCount: number;
  };
}
```

---

## 3. 缓存策略

### 3.1 写入策略

```typescript
shouldCache(context: Context): boolean {
  // 条件：
  // 1. context 内容超过阈值（如 2000 tokens）
  // 2. 不是重复内容
  // 3. 标记为可缓存
  return context.tokens > 2000 && context.cacheable !== false;
}
```

### 3.2 淘汰策略

- **LRU**（最近最少使用）：当缓存满时，淘汰最久未访问的 entry
- **TTL**（时间过期）：超过 24 小时（可配置）自动过期

### 3.3 分层缓存

```
Query → LRU Cache (内存) → Vector Store (磁盘) → 回源
```

---

## 4. 技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| **Vector Store** | Chroma | 轻量、易用、Python 兼容 |
| **LRU Cache** | 自己实现（Map + LinkedList）| 简单、无外部依赖 |
| **存储格式** | JSON 文件 | 便于调试、跨语言 |

---

## 5. 目录结构

```
src/cache/
├── index.ts          # 导出接口
├── entry.ts          # CacheEntry 定义
├── lru-cache.ts      # LRU 内存缓存
├── vector-store.ts   # 向量存储（Chroma）
└── cache-manager.ts  # 缓存管理器（统一入口）
```

---

## 6. 进度

- [x] 目录创建
- [x] CacheEntry 结构设计
- [x] LRU 实现
- [x] Vector Store 框架
- [x] Cache Manager 统一接口
- [x] 单元测试
- [x] 与其他模块接口对齐（待后续对接）

---

## 7. 使用示例

```typescript
import { CacheManager } from './index';

// 初始化
const cache = new CacheManager({
  lru: {
    maxSize: 100,
    maxMemoryTokens: 50000,
    defaultTTLMs: 24 * 60 * 60 * 1000,
  },
  vector: {
    enabled: false, // 暂时关闭向量存储
  }
});

await cache.initialize();

// 写入
await cache.set('query-key', { context: '...' }, {
  agent: 'claude-code',
  project: 'my-project',
  sessionId: 'session-123'
});

// 读取
const result = await cache.get('query-key', {
  agent: 'claude-code',
  project: 'my-project',
  sessionId: 'session-123'
});

// 统计
const stats = cache.getStats();
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
```

---

## 8. 待集成

- [ ] Chroma embedding 服务（需要 OpenAI API key 或本地模型）
- [ ] 与 Input Pipeline 对接
- [ ] 与 Output Pipeline 对接