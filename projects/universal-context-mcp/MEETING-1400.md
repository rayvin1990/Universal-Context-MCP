# Universal Context MCP - Pre-Meeting Materials

**Date:** 2026-03-26 14:00  
**Facilitator:** nia  
**Attendees:** Director, nia, mia, Xiao Ka, Xiao Ma

---

## 1. Project Background (Director's Proposal)

**Core Insight:**
- All AI conversations (Claude Code/Codex/other Agents) should go through MCP middleware
- Achieve maximum token savings through context caching/compression/retrieval

**Pain Points:**
1. Every new conversation requires re-explaining project background
2. Same questions answered repeatedly by different Agents
3. Token waste on repeated context transmission

**Strategic Goals:**
- Token savings ≥ 80%
- Response latency < 500ms
- Support ≥ 3 AI tools (Claude Code, Codex, OpenClaw)

---

## 2. Technical Overview (By mia)

### 2.1 Overall Architecture

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
│  │    Router   │  │    Input   │  │   Output   │             │
│  │             │  │  Pipeline  │  │  Pipeline  │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│         │                │                │                     │
│         └────────────────┼────────────────┘                     │
│                          ▼                                       │
│  ┌─────────────────────────────────────────┐                    │
│  │            Cache Layer                    │                    │
│  │  ┌─────────────┐  ┌─────────────┐      │                    │
│  │  │ Vector Store │  │  LRU Cache  │      │                    │
│  │  │ (semantic)   │  │  (session)  │      │                    │
│  │  └─────────────┘  └─────────────┘      │                    │
│  └─────────────────────────────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Core Modules

| Module | Responsibility | Needs LLM? |
|--------|----------------|------------|
| Router | Agent identification, request routing | ❌ No |
| Input Pipeline | Intent classification, context retrieval | ❌ No (vector search) |
| Output Pipeline | Content filter, summarization | ⚠️ Optional (can be rule-based) |
| Cache Layer | Vector store, LRU cache | ❌ No |

### 2.3 Technology Selection

- **Vector DB:** Chroma (lightweight, easy to use, Python native)
- **MCP Protocol:** Extend existing ai-code-viz-poc MCP Server
- **OpenClaw Integration:** MCP Server as plugin

---

## 3. Effort Estimation

| Module | Function | Effort (person-days) | Owner |
|--------|----------|----------------------|-------|
| Router | Agent identification, request routing | 1 | mia |
| Input Pipeline | Intent classification, context retrieval | 2 | Xiao Ka |
| Output Pipeline | Content filter, summarization | 2 | Xiao Ka |
| Cache Layer | Vector store, LRU cache | 2 | Xiao Ma |
| MCP Integration | Server extension, multi-agent support | 1 | Xiao Ma |
| OpenClaw Integration | Plugin, channel adapter | 1 | mia |
| Testing/Docs | Unit tests, documentation | 1 | mia |
| **Total** | | **10 person-days** | |

### Timeline

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

## 4. Decisions Needed in Afternoon Meeting

### 4.1 Strategic Decisions
- [ ] **Priority Confirmation:** P0 (core infrastructure) - agree?
- [ ] **Start Time:** Start immediately / After TeamTask completes (3/30)?
- [ ] **Resource Investment:** 10 person-days, 2 weeks - team bandwidth OK?

### 4.2 Tactical Decisions
- [ ] **Technology Approval:** Chroma + MCP extension plan - approved?
- [ ] **Module Division:** mia/Xiao Ka/Xiao Ma split - reasonable?
- [ ] **Milestones:** Week 1 basic framework, Week 2 cache layer + integration

### 4.3 Risk Contingency
- [ ] Vector search accuracy insufficient → Hybrid search (keyword + vector)
- [ ] Multi-agent compatibility → Phase-by-phase testing, Claude Code first
- [ ] Cache penetration → Tiered cache + degradation strategy

---

## 5. Reference Documents

- Technical Design: `projects/universal-context-mcp/DESIGN.md`
- Strategic Records: `MEMORY.md` → Universal Context MCP section

---

**Meeting Goal:** Complete decisions in 1 hour, distribute tasks, clarify start time
