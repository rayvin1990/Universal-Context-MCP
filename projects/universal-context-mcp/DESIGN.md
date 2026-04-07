# Universal Context MCP - Technical Design

**Version:** v0.1  
**Date:** 2026-03-26  
**Status:** Draft

---

## 1. Background & Goals

### 1.1 Background

Director's strategic direction: All AI conversations (Claude Code/Codex/OpenClaw, etc.) go through an MCP middleware layer, implementing context caching/compression/retrieval for maximum token savings.

Core philosophy: **"It's easier to change the product than to change people"** — Instead of trying to change user prompt habits, the MCP middleware automatically optimizes.

### 1.2 Goals

- **Universal**: Support all major AI tools (Claude Code, Codex, OpenClaw)
- **Context**: Automatically extract/cache project context
- **MCP (Middleware)**: Standardized protocol, plugin architecture

### 1.3 Core Metrics

| Metric | Target |
|--------|--------|
| Token Savings | ≥ 80% |
| Response Latency | < 500ms |
| Supported AI Tools | ≥ 3 |
| Cache Hit Rate | ≥ 60% |

---

## 2. Existing Architecture Reference

### 2.1 ai-code-viz-poc MCP Server (Existing)

```
┌─────────────────┐
│ Claude Code     │
│ (MCP Client)   │
└────────┬────────┘
         │ MCP Protocol (stdio)
         ▼
┌─────────────────┐
│ mcp-server.js   │
│                 │
│ - extract_context()   │
│ - analyze_project()   │
│ - parseSource()       │
└─────────────────┘
```

**Existing Capabilities:**
- ✅ Source code parsing (JS/TS/Python/Go/Java)
- ✅ Function/class/import extraction
- ✅ Relevance-based context selection
- ✅ MCP Server stdio protocol
- ✅ Claude Code integration

**To Add:**
- ❌ Vector semantic search
- ❌ Context caching/reuse
- ❌ Multi-AI tool support (Codex, OpenClaw)
- ❌ Session context management

---

## 3. System Architecture

### 3.1 Overall Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Agents                                │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────┐          │
│   │ Claude Code │   │   Codex    │   │  OpenClaw   │          │
│   └──────┬──────┘   └──────┬──────┘   └──────┬──────┘          │
└──────────┼─────────────────┼─────────────────┼─────────────────┘
           │                 │                 │
           └─────────────────┼─────────────────┘
                             │ MCP Protocol
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Universal Context MCP Server                  │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │    Router   │  │    Input    │  │   Output    │             │
│  │             │  │   Pipeline  │  │   Pipeline  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│         │                │                │                     │
│         └────────────────┼────────────────┘                     │
│                          ▼                                       │
│  ┌─────────────────────────────────────────┐                    │
│  │            Cache Layer                   │                    │
│  │  ┌─────────────┐  ┌─────────────┐      │                    │
│  │  │ Vector Store │  │  LRU Cache  │      │                    │
│  │  │ (semantic)   │  │  (session)  │      │                    │
│  │  └─────────────┘  └─────────────┘      │                    │
│  └─────────────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Core Modules

#### 3.2.1 Router

**Responsibility:** Identify different AI tools, route to different handling strategies

**Functions:**
- Agent identification (Claude Code / Codex / OpenClaw)
- Tool call routing
- Request distribution

**Implementation:**
```typescript
interface Router {
  identifyAgent(request: MCPRequest): AgentType;
  route(request: MCPRequest): Promise<MCPResponse>;
}

enum AgentType {
  CLAUDE_CODE = 'claude_code',
  CODEX = 'codex',
  OPENCLAW = 'openclaw'
}
```

#### 3.2.2 Input Pipeline

**Responsibility:** Process requests from AI, extract/supplement context

**Input Processing Flow:**
```
User Query → Intent Classification → Context Retrieval → Context Injection → Enhanced Prompt
```

**Functions:**
1. **Intent Classification** - Determine what user wants (code edit / Q&A / analysis)
2. **Project Structure Awareness** - Load project root, dependencies, config
3. **Historical Context Loading** - Historical sessions for same project
4. **Semantic Search** - Search similar context in vector store
5. **Context Injection** - Format and inject into prompt

**Implementation:**
```typescript
interface InputPipeline {
  process(request: MCPRequest): Promise<EnhancedPrompt>;
  
  // Sub-modules
  intentClassifier: IntentClassifier;
  projectResolver: ProjectResolver;
  contextRetriever: ContextRetriever;
  promptInjector: PromptInjector;
}
```

#### 3.2.3 Output Pipeline

**Responsibility:** Process AI responses, filter/summarize/format

**Output Processing Flow:**
```
AI Response → Content Filter → Summarize → Cache → Return
```

**Functions:**
1. **Content Filter** - Remove redundant, duplicate info
2. **Summarize** - LLM summarizes key info
3. **Cache Write** - Store to vector store + LRU cache
4. **Format Conversion** - Adapt to different Agent formats

**Implementation:**
```typescript
interface OutputPipeline {
  process(response: AIResponse): Promise<ProcessedResponse>;
  
  // Sub-modules
  contentFilter: ContentFilter;
  summarizer: Summarizer;
  cacheWriter: CacheWriter;
}
```

#### 3.2.4 Cache Layer

**Responsibility:** Store and retrieve context

**Components:**
1. **Vector Store**
   - Purpose: Semantic similarity search
   - Options: Chroma / Weaviate / FAISS
   - Content: Code snippets, docs, decision records

2. **LRU Cache**
   - Purpose: Fast access to recent context
   - Content: Complete context for current session
   - Strategy: Isolated by Agent + Project + Session ID

**Cache Strategy:**
```typescript
interface CacheStrategy {
  // Write strategy
  shouldCache(context: Context): boolean;
  
  // Read strategy
  getCached(query: string): Promise<Context | null>;
  
  // Expiration strategy
  shouldExpire(entry: CacheEntry): boolean;
}
```

---

## 4. Technical Implementation Details

### 4.1 MCP Server Implementation

**Based on ai-code-viz-poc extension:**

```javascript
// New tools
tools: [
  // Existing tools (keep)
  { name: 'extract_context', ... },
  { name: 'analyze_project', ... },
  
  // New tools
  { name: 'get_context', description: 'Get enhanced context' },
  { name: 'cache_context', description: 'Cache current context' },
  { name: 'search_similar', description: 'Search for similar context' },
  { name: 'clear_cache', description: 'Clear cache' },
]
```

### 4.2 Vector Database Selection

| Database | Pros | Cons | Use Case |
|----------|------|------|----------|
| **Chroma** | Lightweight, easy to use, Python native | Limited features | Fast prototype, personal use |
| **Weaviate** | Feature-rich, complex queries | Resource intensive | Enterprise |
| **FAISS** | High performance, Facebook-backed | Python only | Large-scale search |

**Recommended: Chroma**
- Lightweight, easy to deploy
- Compatible with existing Python stack
- Sufficient for initial needs

### 4.3 OpenClaw Integration

**Method:** MCP Server as OpenClaw plugin

```yaml
# openclaw.json
{
  "mcpServers": {
    "universal-context": {
      "command": "node",
      "args": ["universal-context-mcp/server.js"],
      "enabled": true
    }
  }
}
```

**OpenClaw-specific Features:**
- Multi-channel support (Feishu/Telegram/Discord)
- Session isolation (Task ID)
- Heartbeat task triggering

---

## 5. Effort Estimation

### 5.1 Module Breakdown

| Module | Function | Effort (person-days) | Owner |
|--------|----------|----------------------|-------|
| **Router** | Agent identification, request routing | 1 | mia |
| **Input Pipeline** | Intent classification, context retrieval | 2 | Xiao Ka |
| **Output Pipeline** | Content filter, summarization | 2 | Xiao Ka |
| **Cache Layer** | Vector store, LRU cache | 2 | Xiao Ma |
| **MCP Integration** | Server extension, multi-agent support | 1 | Xiao Ma |
| **OpenClaw Integration** | Plugin, channel adapter | 1 | mia |
| **Testing/Docs** | Unit tests, documentation | 1 | mia |
| **Total** | | **10 person-days** | |

### 5.2 Timeline

```
Week 1 (3/27-3/31):
  Day 1-2: Router + MCP Server basics
  Day 3-4: Input Pipeline (context retrieval)
  Day 5: Output Pipeline (summarization)
  
Week 2 (4/1-4/3):
  Day 6-7: Cache Layer (vector DB integration)
  Day 8: OpenClaw Integration
  Day 9: Testing + Documentation
```

---

## 6. Risks & Challenges

| Risk | Impact | Mitigation |
|------|--------|------------|
| Vector search accuracy | Context mismatch | Hybrid search (keyword + vector) |
| Multi-agent compatibility | Some tools unavailable | Phase-by-phase testing, Claude Code first |
| Cache penetration | Frequent LLM calls | Tiered cache + degradation strategy |
| Token calculation error | Budget overrun | Local token estimation + monitoring |

---

## 7. Next Steps

1. **Approve design** - Director approval
2. **Task distribution** - Assign modules to team members
3. **Daily standups** - Sync progress

---

**Draft complete, pending further details**
