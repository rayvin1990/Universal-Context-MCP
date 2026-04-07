/**
 * Input Pipeline - 输入侧主管道
 * 整合意图识别、上下文检索、Prompt 注入
 */

import { IntentClassifier, IntentType } from './intent-classifier.js';
import { ProjectResolver } from './project-resolver.js';
import { ContextRetriever } from './context-retriever.js';

export { IntentClassifier, IntentType };
export { ProjectResolver };
export { ContextRetriever };

export class InputPipeline {
  constructor(options = {}) {
    this.options = {
      maxContextTokens: 8000,
      enableCaching: true,
      ...options
    };

    this.intentClassifier = new IntentClassifier(options.intentClassifier);
    this.projectResolver = new ProjectResolver(options.projectResolver);
    this.contextRetriever = new ContextRetriever(options.contextRetriever);
    this.cache = new Map();
  }

  /**
   * 处理用户请求
   * @param {string} prompt - 用户输入
   * @param {Object} context - 上下文信息
   * @returns {Promise<EnhancedPrompt>}
   */
  async process(prompt, context = {}) {
    const startTime = Date.now();

    // 1. 意图识别
    const intentResult = await this.intentClassifier.classify(prompt, context);

    // 2. 项目解析
    let projectInfo = null;
    if (context.projectPath) {
      projectInfo = await this.projectResolver.resolve(context.projectPath);
    }

    // 3. 上下文检索
    const contextResults = await this.contextRetriever.retrieve(prompt, {
      ...context,
      projectPath: context.projectPath,
      intent: intentResult.intent
    });

    // 4. 构建增强 Prompt
    const enhancedPrompt = this.buildEnhancedPrompt(prompt, {
      intent: intentResult,
      project: projectInfo,
      context: contextResults
    });

    return {
      original: prompt,
      enhanced: enhancedPrompt,
      metadata: {
        intent: intentResult,
        project: projectInfo,
        contextResults: contextResults.length,
        processingTime: Date.now() - startTime
      }
    };
  }

  /**
   * 构建增强后的 Prompt
   */
  buildEnhancedPrompt(prompt, data) {
    const parts = [];

    // 项目上下文
    if (data.project) {
      parts.push(this.formatProjectContext(data.project));
    }

    // 检索到的上下文
    if (data.context && data.context.length > 0) {
      parts.push(this.formatRetrievedContext(data.context));
    }

    // 意图信息
    if (data.intent) {
      parts.push(`<!-- Intent: ${data.intent.intent} (${data.intent.confidence.toFixed(2)}) -->`);
    }

    // 原始 prompt
    parts.push(`\n## User Request\n${prompt}`);

    return parts.join('\n\n');
  }

  /**
   * 格式化项目上下文
   */
  formatProjectContext(project) {
    const lines = [
      '## Project Context',
      `**Name:** ${project.name}`,
      `**Language:** ${project.language}`,
      `**Framework:** ${project.framework}`
    ];

    // 项目结构
    if (project.structure) {
      const sourceFiles = project.structure.files
        .filter(f => f.type === 'source')
        .slice(0, 20)
        .map(f => f.name);

      if (sourceFiles.length > 0) {
        lines.push(`\n**Key Files:**\n${sourceFiles.map(f => `- ${f}`).join('\n')}`);
      }
    }

    // 依赖
    if (project.dependencies) {
      const deps = Object.keys(project.dependencies.dependencies || {}).slice(0, 10);
      if (deps.length > 0) {
        lines.push(`\n**Dependencies:** ${deps.join(', ')}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 格式化检索到的上下文
   */
  formatRetrievedContext(contexts) {
    const sections = ['## Retrieved Context'];

    for (const ctx of contexts) {
      sections.push(`\n### ${ctx.file}`);
      if (ctx.line) {
        sections.push(`*Line ${ctx.line}*`);
      }
      sections.push(`\`\`\`\n${ctx.content}\n\`\`\``);
    }

    return sections.join('\n');
  }

  /**
   * 设置向量存储
   */
  setVectorStore(vectorStore) {
    this.contextRetriever.setVectorStore(vectorStore);
  }

  setCacheManager(cacheManager) {
    this.contextRetriever.setCacheManager(cacheManager);
  }

  /**
   * 清理缓存
   */
  clearCache() {
    this.cache.clear();
    this.projectResolver.clearCache();
  }
}

export default InputPipeline;
