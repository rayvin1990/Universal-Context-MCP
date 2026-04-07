/**
 * Output Pipeline - 输出侧主管道
 * 整合内容过滤、摘要压缩、缓存存储
 */

import { ContentFilter } from './content-filter.js';
import { Summarizer } from './summarizer.js';

const DEFAULT_OPTIONS = {
  // 启用内容过滤
  enableFilter: true,
  // 启用摘要
  enableSummarize: true,
  // 启用缓存
  enableCache: true,
  // 自动摘要阈值（字符数）
  autoSummarizeThreshold: 5000,
  // 摘要模式
  summarizeMode: 'concise',
  // 是否提取关键信息
  extractKeyInfo: true,
  // 返回完整结果还是仅返回处理后的内容
  returnFullResult: true,
};

export class OutputPipeline {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.contentFilter = new ContentFilter(options.contentFilter);
    this.summarizer = options.summarizer || new Summarizer(options.summarizer);

    this.cacheManager = null;
    this.vectorStore = null;

    this.stats = {
      processed: 0,
      filtered: 0,
      summarized: 0,
      cached: 0,
      errors: 0,
    };
  }

  /**
   * 设置缓存管理器
   */
  setCacheManager(cacheManager) {
    this.cacheManager = cacheManager;
  }

  /**
   * 设置向量存储
   */
  setVectorStore(vectorStore) {
    this.vectorStore = vectorStore;
  }

  /**
   * 处理 AI 响应
   * @param {string} response - AI 原始响应
   * @param {Object} context - 上下文信息
   * @returns {Promise<ProcessedResponse>}
   */
  async process(response, context = {}) {
    const startTime = Date.now();
    const result = {
      original: response,
      processed: response,
      filtered: null,
      summarized: null,
      keyInfo: null,
      cached: false,
      metadata: {
        context,
        processingTime: 0,
        stages: [],
      },
    };

    try {
      this.stats.processed++;

      // 阶段 1: 内容过滤
      if (this.options.enableFilter) {
        const filterResult = this.contentFilter.filter(response, context.filterOptions);
        result.filtered = filterResult;
        result.processed = filterResult.content;
        result.metadata.stages.push({
          name: 'filter',
          duration: 0, // 同步操作，忽略时间
          removed: filterResult.removed,
          stats: filterResult.stats,
        });
        this.stats.filtered++;

        // 跟踪内容用于去重
        if (context.sessionId) {
          this.contentFilter.trackContent(context.sessionId, result.processed);
        }
      }

      // 阶段 2: 摘要压缩（如果内容超过阈值）
      if (this.options.enableSummarize && response.length > this.options.autoSummarizeThreshold) {
        try {
          const summaryResult = await this.summarizer.summarize(result.processed, {
            mode: this.options.summarizeMode,
          });
          result.summarized = summaryResult;

          // 如果摘要效果好，使用摘要内容
          if (summaryResult.compressionRatio > 0.3) {
            result.processed = summaryResult.summary;
          }

          result.metadata.stages.push({
            name: 'summarize',
            summary: summaryResult.summary,
            compressionRatio: summaryResult.compressionRatio,
          });
          this.stats.summarized++;
        } catch (error) {
          console.warn('摘要失败，使用原始内容:', error.message);
          result.metadata.stages.push({
            name: 'summarize',
            error: error.message,
          });
        }
      }

      // 阶段 3: 提取关键信息（用于缓存索引）
      if (this.options.extractKeyInfo) {
        try {
          const keyInfo = await this.summarizer.extractKeyInfo(result.processed);
          result.keyInfo = keyInfo;
          result.metadata.stages.push({
            name: 'extract',
            keyInfo,
          });
        } catch (error) {
          console.warn('关键信息提取失败:', error.message);
        }
      }

      // 阶段 4: 缓存存储
      if (this.options.enableCache && this.cacheManager) {
        await this.cacheResult(result, context);
        result.cached = true;
        this.stats.cached++;
      }

      result.metadata.processingTime = Date.now() - startTime;

      return this.options.returnFullResult ? result : result.processed;
    } catch (error) {
      this.stats.errors++;
      throw new OutputPipelineError(`输出处理失败: ${error.message}`, error);
    }
  }

  /**
   * 缓存结果
   */
  async cacheResult(result, context) {
    if (!this.cacheManager) return;

    const { sessionId, projectId, agentType } = context;
    const scope = { sessionId, project: projectId, agent: agentType };

    // 准备缓存数据
    const cacheData = {
      content: result.processed,
      originalLength: result.original?.length || 0,
      filteredContent: result.filtered?.content,
      filterStats: result.filtered?.stats,
      summary: result.summarized?.summary,
      compressionRatio: result.summarized?.compressionRatio,
      keyInfo: result.keyInfo,
      metadata: {
        ...context,
        processedAt: Date.now(),
      },
    };

    // 缓存完整响应
    const cacheKey = `output:${sessionId}:${Date.now()}`;
    await this.cacheManager.set(cacheKey, cacheData, {
      scope,
      text: result.original?.slice(0, 200),
      cacheType: 'ai-response',
      ttlMs: 60 * 60 * 1000, // 1小时
    });

    // 如果有摘要，单独缓存摘要
    if (result.summarized?.summary) {
      const summaryKey = `summary:${sessionId}:${Date.now()}`;
      await this.cacheManager.set(summaryKey, {
        summary: result.summarized.summary,
        keyInfo: result.keyInfo,
        originalLength: result.original?.length || 0,
      }, {
        scope,
        text: result.summarized.summary.slice(0, 200),
        cacheType: 'ai-summary',
        ttlMs: 24 * 60 * 60 * 1000, // 24小时
      });
    }

    // 存入向量库（用于语义检索）
    if (this.vectorStore) {
      const searchText = result.processed.slice(0, 5000);
      await this.vectorStore.add([{
        id: cacheKey,
        text: searchText,
        value: cacheData,
        metadata: {
          ...scope,
          type: 'ai-response',
          hasSummary: Boolean(result.summarized),
        },
      }]);
    }
  }

  /**
   * 批量处理多个响应
   */
  async batchProcess(responses, context = {}) {
    const results = [];
    for (const response of responses) {
      try {
        const result = await this.process(response, context);
        results.push({ success: true, result });
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }
    return results;
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      filterStats: this.contentFilter ? 'available' : 'none',
      summarizerStats: this.summarizer?.getStats(),
    };
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.contentFilter?.clearCache?.();
    this.summarizer?.clearCache?.();
  }

  /**
   * 清除会话跟踪
   */
  clearSession(sessionId) {
    this.contentFilter?.clearSession?.(sessionId);
  }
}

/**
 * 输出管道错误类
 */
export class OutputPipelineError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'OutputPipelineError';
    this.cause = cause;
  }
}

export default OutputPipeline;