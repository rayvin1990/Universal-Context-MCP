/**
 * Intent Classifier - 意图识别模块
 * 规则 + 轻量模型混合，判断用户意图
 */

export const IntentType = {
  CODE_MODIFY: 'code_modify',     // 代码修改/重构
  CODE_GENERATE: 'code_generate', // 代码生成
  QUESTION: 'question',           // 问答/解释
  ANALYSIS: 'analysis',          // 分析/调试
  REFACTOR: 'refactor',           // 重构
  DOCUMENTATION: 'documentation', // 文档
  SEARCH: 'search',               // 搜索
  UNKNOWN: 'unknown'
};

// 意图识别规则模式
const INTENT_PATTERNS = {
  [IntentType.CODE_MODIFY]: [
    /\b(fix|modify|change|update|edit|replace)\b/i,
    /\bbug|error|issue|broken\b/i,
    /→\s*\$|^#.*\b(edit|fix|modify)\b/i,
    /修复|优化|改进|修改|调整|改写/i
  ],
  [IntentType.CODE_GENERATE]: [
    /\b(create|generate|write|add|implement|build)\b/i,
    /\bnew\s+(function|class|method|file)\b/i,
    /→\s*[\w\-]+\s*\(/i,
    /创建|生成|添加|实现|编写|新建|新增/i
  ],
  [IntentType.QUESTION]: [
    /\b(what|how|why|when|where|who)\b/i,
    /\?(?:\s*$|\s+)/,
    /\b(explain|describe|tell me about)\b/i,
    /怎么|如何|是什么|为什么|哪里|谁|请问/i
  ],
  [IntentType.ANALYSIS]: [
    /\b(analyze|debug|trace|inspect|check)\b/i,
    /\b(performance|memory|slow|leak)\b/i,
    /\bwhy\s+(not|is|does)\b/i,
    /分析|调试|检查|排查|诊断|查找|查看/i
  ],
  [IntentType.REFACTOR]: [
    /\b(refactor|reorganize|restructure|clean)\b/i,
    /\b(better|improve|optimize)\b/i,
    /\bdesign\s+(pattern|pattern)\b/i,
    /重构|重写|整理|优化/i
  ],
  [IntentType.DOCUMENTATION]: [
    /\b(doc|document|comment|readme)\b/i,
    /\bwrite\s+(docs?|documentation)\b/i,
    /文档|说明|注释|写文档/i
  ],
  [IntentType.SEARCH]: [
    /\b(find|search|look\s+for|locate)\b/i,
    /\bwhere\s+(is|are|was)\b/i,
    /查找|搜索|寻找|定位|在哪儿|哪个文件/i
  ]
};

/**
 * 意图分类器
 */
export class IntentClassifier {
  constructor(options = {}) {
    this.options = {
      confidenceThreshold: 0.6,
      useModelFallback: true,
      ...options
    };
  }

  /**
   * 分类用户意图
   * @param {string} prompt - 用户输入
   * @param {Object} context - 上下文信息
   * @returns {Promise<IntentResult>}
   */
  async classify(prompt, context = {}) {
    // 规则匹配
    const ruleResult = this.classifyByRules(prompt);

    if (ruleResult.confidence >= this.options.confidenceThreshold) {
      return ruleResult;
    }

    // 轻量模型 fallback（可扩展）
    if (this.options.useModelFallback) {
      return this.classifyByModel(prompt, context);
    }

    return ruleResult;
  }

  /**
   * 规则匹配
   */
  classifyByRules(prompt) {
    const scores = {};

    for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
      scores[intent] = 0;
      for (const pattern of patterns) {
        if (pattern.test(prompt)) {
          scores[intent] += 1;
        }
      }
    }

    // 归一化
    let maxScore = 0;
    let bestIntent = IntentType.UNKNOWN;

    for (const [intent, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        bestIntent = intent;
      }
    }

    const totalPatterns = Object.values(INTENT_PATTERNS).flat().length;
    const confidence = maxScore / Math.max(1, totalPatterns / 10);

    return {
      intent: bestIntent,
      confidence: Math.min(confidence, 1.0),
      method: 'rule'
    };
  }

  /**
   * 轻量模型分类（预留接口）
   */
  async classifyByModel(prompt, context) {
    // TODO: 集成轻量模型
    // 暂时返回规则匹配结果
    return this.classifyByRules(prompt);
  }
}

export default IntentClassifier;
