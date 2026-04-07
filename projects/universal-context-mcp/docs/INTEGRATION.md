# Universal Context MCP 集成指南

## 🎯 概述

Universal Context MCP (UC MCP) 是一个通用的上下文中间层，用于所有 AI 对话（Claude Code/Codex/OpenClaw等），实现上下文缓存/压缩/检索，极致省 token。

## 📦 安装

```bash
cd D:\openclaw\workspace\projects\universal-context-mcp
npm install
```

## 🔧 集成方式

### 方式 1：MCP Server 模式（推荐）

**原理：** UC MCP 作为 MCP Server 运行，每个 Agent 作为 MCP Client 连接。

#### 1. Claude Code 集成

**配置 `.claude.json`：**

```json
{
  "mcpServers": {
    "universal-context": {
      "command": "node",
      "args": ["D:/openclaw/workspace/projects/universal-context-mcp/src/server.js"],
      "cwd": "D:/openclaw/workspace"
    }
  }
}
```

**位置：** `C:\Users\57684\.claude.json`（Windows）

**测试工具：**

```bash
# 1. 启动 Claude Code
claude-code

# 2. 测试 get_context
/tool get_context prompt="如何修改路由层？" projectPath="./my-project" sessionId="session-123"

# 3. 测试 search_similar
/tool search_similar query="路由层修改" projectPath="./my-project" limit=5

# 4. 测试 cache_context
/tool cache_context key="router-modification" content="修改了路由层的实现"

# 5. 测试 clear_cache
/tool clear_cache key="router-modification"
```

#### 2. Codex 集成

**配置 `.codex.json`：**

```json
{
  "mcpServers": {
    "universal-context": {
      "command": "node",
      "args": ["D:/openclaw/workspace/projects/universal-context-mcp/src/server.js"],
      "cwd": "D:/openclaw/workspace"
    }
  }
}
```

**位置：** `C:\Users\57684\.codex.json`（Windows）

**测试工具：**

```bash
# 1. 启动 Codex
codex

# 2. 测试 get_context
/tool get_context prompt="如何修改路由层？" projectPath="./my-project" sessionId="session-123"

# 3. 测试 search_similar
/tool search_similar query="路由层修改" projectPath="./my-project" limit=5

# 4. 测试 cache_context
/tool cache_context key="router-modification" content="修改了路由层的实现"

# 5. 测试 clear_cache
/tool clear_cache key="router-modification"
```

#### 3. OpenClaw 集成

**配置 `openclaw.json`：**

```json
{
  "mcpServers": {
    "universal-context": {
      "command": "node",
      "args": ["D:/openclaw/workspace/projects/universal-context-mcp/src/server.js"],
      "cwd": "D:/openclaw/workspace"
    }
  }
}
```

**位置：** `C:\Users\57684\.openclaw\openclaw.json`（Windows）

**测试工具：**

```bash
# 1. 启动 OpenClaw
openclaw

# 2. 测试 get_context
/tool get_context prompt="如何修改路由层？" projectPath="./my-project" sessionId="session-123"

# 3. 测试 search_similar
/tool search_similar query="路由层修改" projectPath="./my-project" limit=5

# 4. 测试 cache_context
/tool cache_context key="router-modification" content="修改了路由层的实现"

# 5. 测试 clear_cache
/tool clear_cache key="router-modification"
```

### 方式 2：插件模式

**原理：** UC MCP 作为插件集成到每个 Agent，Agent 启动时自动加载。

**配置 `plugin.js`：**

```javascript
import UniversalContextMCPPlugin from './projects/universal-context-mcp/openclaw/plugin.js';

const ucMCP = new UniversalContextMCPPlugin();
await ucMCP.initialize();

// 处理请求时
const enhancedContext = await ucMCP.enhanceContext(userPrompt);
const result = await aiAgent.process(enhancedContext);
const filteredResult = await ucMCP.filterOutput(result);
```

### 方式 3：中间件模式

**原理：** UC MCP 作为中间件拦截所有 AI 请求。

**启动中间件：**

```bash
node projects/universal-context-mcp/src/middleware.js
```

**配置：**

```
Agent → UC MCP Middleware → AI
```

## 📊 预期效果

### Token 节省

- **输入侧：** 自动补充上下文，减少重复输入 → 节省 30-50%
- **输出侧：** 过滤冗余信息，只返回关键内容 → 节省 20-30%
- **缓存层：** 高频信息缓存，减少 LLM 调用 → 节省 40-60%

**综合节省：** **50-70%**

### 响应速度

- **缓存命中：** < 100ms（原 8-10 秒）
- **缓存未命中：** 8-10 秒（正常）

## ❓ 常见问题

### Q1: UC MCP 会影响 AI 响应速度吗？

**A:** 不会。UC MCP 作为中间层，只在首次调用时增加少量延迟（< 100ms），后续缓存命中时响应速度会更快。

### Q2: UC MCP 支持哪些 AI 工具？

**A:** 目前支持：
- ✅ Claude Code
- ✅ Codex
- ✅ OpenClaw
- ⏳ 其他工具（可扩展）

### Q3: UC MCP 会泄露我的数据吗？

**A:** 不会。UC MCP 只在本地运行，所有数据存储在本地，不会上传到任何外部服务器。

### Q4: UC MCP 需要额外配置吗？

**A:** 需要。需要配置 MCP Server 连接（见上方配置示例）。

### Q5: UC MCP 支持中文吗？

**A:** 支持。UC MCP 完全支持中文，包括输入和输出。

## 🎯 最佳实践

### 1. 配置建议

- **缓存大小：** 建议 100 条上下文，TTL 1 小时
- **向量存储：** 建议使用内存模式（轻量），生产环境可使用 Chroma
- **会话隔离：** 每个任务使用独立的 Session ID

### 2. 使用建议

- **首次使用：** 先测试 `get_context` 工具，确认上下文增强效果
- **缓存优化：** 使用 `cache_context` 缓存高频问题
- **清理缓存：** 定期使用 `clear_cache` 清理过期缓存

### 3. 监控建议

- **Token 消耗：** 使用 Token Tracker 监控每个 Agent 的 token 消耗
- **缓存命中率：** 监控缓存命中率，优化缓存策略
- **预算预警：** 使用 Alert System 设置预算预警

## 📝 更新日志

- **v0.1.0** - 初始版本
  - 实现基本工具
  - 支持缓存层
  - 支持 OpenClaw 集成
  - 支持 Claude Code 集成
  - 支持 Codex 集成

## 📄 许可证

MIT
