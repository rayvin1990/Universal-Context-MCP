/**
 * Summarizer - LLM 摘要压缩模块
 * 使用 LLM 对内容进行摘要压缩，提取关键信息
 */

import { LRUCache } from '../cache/lru-cache.js';

const DEFAULT_OPTIONS = {
  // 模型名称
  model: 'claude-sonnet-4-6',
  // 最大 token 数
  maxTokens: 4000,
  // 摘要目标长度（字数）
  targetLength: 500,
  // 摘要模式: concise | standard | detailed
  mode: 'concise',
  // 是否启用缓存
  enableCache: true,
  // 缓存 TTL（毫秒）
  cacheTtlMs: 30 * 60 * 1000,
  // 最大摘要内容长度（超过此长度先截断再摘要）
  maxInputLength: 50000,
  // 是否使用流式处理
  streaming: false,
  // API 端点
  apiEndpoint: process.env.LLM_API_ENDPOINT || 'https://api.anthropic.com/v1/messages',
  // API Key
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.DEEPSEEK_API_KEY,
};

// 摘要提示词模板
const SUMMARIZATION_PROMPTS = {
  concise: `请将以下内容压缩为关键要点摘要，保留最重要的信息，删除重复和冗余部分。输出格式为简洁的要点列表。

内容：
{{content}}

要求：
- 保留核心信息和技术细节
- 删除模板化语言和客套话
- 保留代码片段中的关键逻辑（如有）
- 输出中文`,

  standard: `请对以下内容进行摘要，提取关键信息和要点。保持原文的重要细节，同时大幅精简。

内容：
{{content}}

要求：
- 提取核心观点和关键信息
- 保留重要的技术细节和代码逻辑
- 删除重复和冗余内容
- 格式清晰，便于快速阅读
- 输出中文`,

  detailed: `请对以下内容进行详细摘要，保留更多细节和上下文信息。

内容：
{{content}}

要求：
- 全面覆盖原文信息
- 保留重要的代码、配置、决策等细节
- 保持逻辑结构清晰
- 输出中文`
};

// 关键信息提取提示词
const EXTRACTION_PROMPT = `从以下内容中提取关键信息，用于上下文缓存和检索。

内容：
{{content}}

请提取：
1. 关键概念/术语（最多10个）
2. 主要操作/动作（最多5个）
3. 涉及的实体/对象（文件、函数、类等）
4. 决定性结论或结果

输出格式：
- 概念：[用逗号分隔的概念]
- 操作：[用逗号分隔的操作]
- 实体：[用逗号分隔的实体]
- 结论：[一句话总结]`;

// 会话级缓存
const summarizerCache = new LRUCache({
  maxEntries: 50,
  maxSizeBytes: 10 * 1024 * 1024,
  ttlMs: 30 * 60 * 1000,
});

export class Summarizer {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.cache = this.options.enableCache ? summarizerCache : new LRUCache({ maxEntries: 0 });
    this.stats = {
      calls: 0,
      cacheHits: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      errors: 0,
    };
  }

  /**
   * 摘要内容
   * @param {string} content - 需要摘要的内容
   * @param {Object} options - 选项
   * @returns {Promise<SummaryResult>}
   */
  async summarize(content, options = {}) {
    const opts = { ...this.options, ...options };
    this.stats.calls++;

    // 预处理内容
    const processed = this.preprocess(content, opts.maxInputLength);

    // 检查缓存
    const cacheKey = this.hashContent(processed + opts.mode);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      this.stats.cacheHits++;
      return { ...cached, fromCache: true };
    }

    try {
      // 调用 LLM 进行摘要
      const summary = await this.callLLM(processed, opts);

      const result = {
        summary,
        mode: opts.mode,
        originalLength: content.length,
        summaryLength: summary.length,
        compressionRatio: (1 - summary.length / content.length).toFixed(2),
        timestamp: Date.now(),
      };

      // 缓存结果
      this.cache.set(cacheKey, result);

      return result;
    } catch (error) {
      this.stats.errors++;
      throw new SummarizationError(`摘要失败: ${error.message}`, error);
    }
  }

  /**
   * 提取关键信息
   * @param {string} content - 内容
   * @param {Object} options - 选项
   * @returns {Promise<ExtractionResult>}
   */
  async extractKeyInfo(content, options = {}) {
    const opts = { ...this.options, ...options };
    const processed = this.preprocess(content, opts.maxInputLength);

    const cacheKey = this.hashContent('extract:' + processed);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    try {
      const prompt = EXTRACTION_PROMPT.replace('{{content}}', processed);
      const result = await this.callLLM(prompt, opts);

      const parsed = this.parseExtractionResult(result);

      return {
        ...parsed,
        timestamp: Date.now(),
      };
    } catch (error) {
      this.stats.errors++;
      throw new SummarizationError(`关键信息提取失败: ${error.message}`, error);
    }
  }

  /**
   * 预处理内容
   */
  preprocess(content, maxLength) {
    if (!content || typeof content !== 'string') {
      return '';
    }

    let processed = content.trim();

    // 移除过多的空行
    processed = processed.replace(/\n{4,}/g, '\n\n\n');

    // 截断过长的内容
    if (processed.length > maxLength) {
      const half = Math.floor(maxLength / 2);
      processed = processed.slice(0, half) + '\n\n...[内容已截断]...\n\n' + processed.slice(-half);
    }

    return processed;
  }

  /**
   * 调用 LLM
   */
  async callLLM(content, options) {
    const prompt = SUMMARIZATION_PROMPTS[options.mode] || SUMMARIZATION_PROMPTS.concise;
    const fullPrompt = prompt.replace('{{content}}', content);

    // 检测使用哪个 API
    const isDeepSeek = options.apiKey && options.apiKey.includes('sk-');

    if (isDeepSeek) {
      return this.callDeepSeek(fullPrompt, options);
    }

    return this.callAnthropic(fullPrompt, options);
  }

  /**
   * 调用 Anthropic API
   */
  async callAnthropic(prompt, options) {
    const response = await fetch(options.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': options.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options.model,
        max_tokens: 1024,
        messages: [
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API 错误: ${response.status} - ${error}`);
    }

    const data = await response.json();
    this.stats.totalOutputTokens += data.usage?.output_tokens || 0;
    return data.content?.[0]?.text || '';
  }

  /**
   * 调用 DeepSeek API
   */
  async callDeepSeek(prompt, options) {
    const endpoint = options.apiEndpoint.includes('deepseek')
      ? options.apiEndpoint
      : 'https://api.deepseek.com/v1/chat/completions';

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model || 'deepseek-chat',
        messages: [
          { role: 'user', content: prompt }
        ],
        max_tokens: options.maxTokens || 1024,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`DeepSeek API 错误: ${response.status} - ${error}`);
    }

    const data = await response.json();
    this.stats.totalOutputTokens += data.usage?.completion_tokens || 0;
    return data.choices?.[0]?.message?.content || '';
  }

  /**
   * 解析关键信息提取结果
   */
  parseExtractionResult(text) {
    const result = {
      concepts: [],
      actions: [],
      entities: [],
      conclusion: '',
    };

    const lines = text.split('\n');
    for (const line of lines) {
      const colonIndex = line.indexOf(':');
      if (colonIndex === -1) continue;

      const key = line.slice(0, colonIndex).trim().toLowerCase();
      const value = line.slice(colonIndex + 1).trim();

      if (key.includes('概念') || key.includes('term') || key.includes('concept')) {
        result.concepts = value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
      } else if (key.includes('操作') || key.includes('action') || key.includes('动词')) {
        result.actions = value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
      } else if (key.includes('实体') || key.includes('entity') || key.includes('对象')) {
        result.entities = value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
      } else if (key.includes('结论') || key.includes('conclusion') || key.includes('summary')) {
        result.conclusion = value;
      }
    }

    return result;
  }

  /**
   * 批量摘要
   */
  async batchSummarize(contents, options = {}) {
    const results = [];
    for (const content of contents) {
      try {
        const result = await this.summarize(content, options);
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
      cacheHitRate: this.stats.calls > 0
        ? (this.stats.cacheHits / this.stats.calls).toFixed(2)
        : 0,
    };
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * 简单的哈希函数
   */
  hashContent(content) {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }
}

/**
 * 摘要错误类
 */
export class SummarizationError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'SummarizationError';
    this.cause = cause;
  }
}

export default Summarizer;