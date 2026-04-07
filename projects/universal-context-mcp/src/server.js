/**
 * Universal Context MCP Server
 * 主入口文件
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { InputPipeline, IntentClassifier, ProjectResolver, ContextRetriever } from './input/index.js';
import { CacheManager } from './cache/cache-manager.js';

/**
 * MCP Server 实现
 */
class UniversalContextMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'universal-context-mcp',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.inputPipeline = new InputPipeline();
    this.cacheManager = new CacheManager();
    this.inputPipeline.setCacheManager(this.cacheManager);
    this.inputPipeline.setVectorStore(this.cacheManager.getVectorStore());

    this.setupHandlers();
  }

  setupHandlers() {
    // 工具列表
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'get_context',
            description: '获取增强后的上下文（意图识别 + 检索）',
            inputSchema: {
              type: 'object',
              properties: {
                prompt: { type: 'string', description: '用户输入' },
                projectPath: { type: 'string', description: '项目路径' },
                sessionId: { type: 'string', description: '会话ID' }
              },
              required: ['prompt']
            }
          },
          {
            name: 'classify_intent',
            description: '意图识别 - 判断用户意图类型',
            inputSchema: {
              type: 'object',
              properties: {
                prompt: { type: 'string', description: '用户输入' }
              },
              required: ['prompt']
            }
          },
          {
            name: 'analyze_project',
            description: '项目解析 - 分析项目结构',
            inputSchema: {
              type: 'object',
              properties: {
                projectPath: { type: 'string', description: '项目路径' }
              },
              required: ['projectPath']
            }
          },
          {
            name: 'search_similar',
            description: '语义检索相似上下文',
            inputSchema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: '查询文本' },
                projectPath: { type: 'string', description: '项目路径' },
                limit: { type: 'number', description: '返回结果数', default: 5 }
              },
              required: ['query']
            }
          },
          {
            name: 'cache_context',
            description: '缓存当前上下文',
            inputSchema: {
              type: 'object',
              properties: {
                key: { type: 'string', description: '缓存键' },
                content: { type: 'string', description: '上下文内容' }
              },
              required: ['key', 'content']
            }
          },
          {
            name: 'clear_cache',
            description: '清除缓存',
            inputSchema: {
              type: 'object',
              properties: {
                key: { type: 'string', description: '缓存键（可选）' }
              }
            }
          }
        ]
      };
    });

    // 工具调用
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'get_context':
            return await this.handleGetContext(args);

          case 'classify_intent':
            return await this.handleClassifyIntent(args);

          case 'analyze_project':
            return await this.handleAnalyzeProject(args);

          case 'search_similar':
            return await this.handleSearchSimilar(args);

          case 'cache_context':
            return await this.handleCacheContext(args);

          case 'clear_cache':
            return await this.handleClearCache(args);

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${error.message}`
            }
          ],
          isError: true
        };
      }
    });
  }

  /**
   * 获取增强上下文
   */
  async handleGetContext(args) {
    const { prompt, projectPath, sessionId } = args;

    const result = await this.inputPipeline.process(prompt, {
      projectPath,
      sessionId
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }

  /**
   * 意图识别
   */
  async handleClassifyIntent(args) {
    const classifier = new IntentClassifier();
    const result = await classifier.classify(args.prompt);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }

  /**
   * 项目分析
   */
  async handleAnalyzeProject(args) {
    const resolver = new ProjectResolver();
    const result = await resolver.resolve(args.projectPath);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }

  /**
   * 语义检索相似上下文
   */
  async handleSearchSimilar(args) {
    const retriever = new ContextRetriever();
    const result = await retriever.retrieve(args.query, {
      projectPath: args.projectPath
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  }

  /**
   * 缓存上下文
   */
  async handleCacheContext(args) {
    await this.cacheManager.set(args.key, args.content);

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true, key: args.key })
        }
      ]
    };
  }

  /**
   * 清除缓存
   */
  async handleClearCache(args) {
    if (args.key) {
      await this.cacheManager.delete(args.key);
    } else {
      await this.cacheManager.clear();
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ success: true })
        }
      ]
    };
  }

  /**
   * 启动服务器
   */
  async start() {
    await this.cacheManager.initialize();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Universal Context MCP Server started');
  }
}

// 启动
const server = new UniversalContextMCPServer();
server.start().catch(console.error);
