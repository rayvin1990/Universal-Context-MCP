# Universal Context MCP API 文档

## 工具列表

### 1. get_context

**描述：** 获取增强后的上下文（意图识别 + 检索）

**参数：**
- `prompt` (string, 必需) - 用户输入
- `projectPath` (string, 可选) - 项目路径
- `sessionId` (string, 可选) - 会话 ID

**返回：**
```json
{
  "context": "增强后的上下文",
  "intent": "识别的意图",
  "project": "项目信息"
}
```

**示例：**
```json
{
  "name": "get_context",
  "arguments": {
    "prompt": "如何修改路由层？",
    "projectPath": "./my-project",
    "sessionId": "session-123"
  }
}
```

---

### 2. classify_intent

**描述：** 意图识别 - 判断用户意图类型

**参数：**
- `prompt` (string, 必需) - 用户输入

**返回：**
```json
{
  "intent": "code_modification",
  "confidence": 0.95,
  "categories": ["development", "modification"]
}
```

**示例：**
```json
{
  "name": "classify_intent",
  "arguments": {
    "prompt": "帮我修复这个 bug"
  }
}
```

---

### 3. analyze_project

**描述：** 项目解析 - 分析项目结构

**参数：**
- `projectPath` (string, 必需) - 项目路径

**返回：**
```json
{
  "files": ["src/index.js", "src/router.js"],
  "dependencies": ["react", "express"],
  "structure": {
    "src": ["index.js", "router.js"]
  }
}
```

**示例：**
```json
{
  "name": "analyze_project",
  "arguments": {
    "projectPath": "./my-project"
  }
}
```

---

### 4. search_similar

**描述：** 语义检索相似上下文

**参数：**
- `query` (string, 必需) - 查询文本
- `projectPath` (string, 可选) - 项目路径
- `limit` (number, 可选) - 返回结果数，默认 5

**返回：**
```json
{
  "results": [
    {
      "id": "context-1",
      "text": "上下文内容",
      "score": 0.95,
      "metadata": {
        "file": "src/router.js",
        "line": 42
      }
    }
  ]
}
```

**示例：**
```json
{
  "name": "search_similar",
  "arguments": {
    "query": "路由层修改",
    "projectPath": "./my-project",
    "limit": 10
  }
}
```

---

### 5. cache_context

**描述：** 缓存当前上下文

**参数：**
- `key` (string, 必需) - 缓存键
- `content` (string, 必需) - 上下文内容

**返回：**
```json
{
  "success": true,
  "key": "cache-key-123"
}
```

**示例：**
```json
{
  "name": "cache_context",
  "arguments": {
    "key": "router-modification",
    "content": "修改了路由层的实现"
  }
}
```

---

### 6. clear_cache

**描述：** 清除缓存

**参数：**
- `key` (string, 可选) - 缓存键（可选，不传则清除所有）

**返回：**
```json
{
  "success": true
}
```

**示例：**
```json
{
  "name": "clear_cache",
  "arguments": {
    "key": "router-modification"
  }
}
```

---

## 错误处理

### 错误格式

```json
{
  "isError": true,
  "content": [
    {
      "type": "text",
      "text": "错误信息"
    }
  ]
}
```

### 常见错误

1. **Unknown tool** - 工具不存在
2. **Missing required argument** - 缺少必需参数
3. **Session not found** - 会话不存在
4. **Cache error** - 缓存操作失败

---

## 版本历史

- **v0.1.0** - 初始版本
  - 实现基本工具
  - 支持缓存层
  - 支持 OpenClaw 集成
