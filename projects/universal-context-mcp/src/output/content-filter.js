/**
 * Content Filter - 内容过滤模块
 * 去除冗余、重复信息，保留关键内容
 */

// 常见的模板化回复模式
const TEMPLATE_PATTERNS = [
  /^(Here is|Here's|Sure,|Of course|I'd be happy|I would be happy)/i,
  /^(Let me|I'll|I can|I will)/i,
  /^(Certainly|Absolutely|Definitely)/i,
  /^(Thanks for|Thank you for)/i,
  /^(I understand|I see)/i,
];

// 需要过滤的冗余标记
const REDUNDANT_MARKERS = [
  /^(Certainly|Absolutely|Of course|Yes, sure)[\s,!]+/gi,
  /^(Let me|I'll|I will) (help you|provide you|give you|show you|create|write)/gi,
  /\[?\[?NOTE:?\s*This (is a|represents an?)\s+example\)?\]?/gi,
  /\[?\[?NOTE:?\s*(The|Learn more|Visit)\s+[^\]]+\]?/gi,
];

// 代码块中的重复模式
const CODE_PATTERNS = {
  // 常见的 import 重复
  repeatedImports: /^(import\s+.+\s+from\s+['"][^'"]+['"];?\s*)+$/gm,
  // 重复的空行
  repeatedNewlines: /\n{3,}/g,
  // 行尾多余空白
  trailingWhitespace: /[ \t]+$/gm,
};

const DEFAULT_OPTIONS = {
  // 是否启用模板过滤
  filterTemplates: true,
  // 是否启用重复检测
  detectDuplicates: true,
  // 是否清理空白
  cleanWhitespace: true,
  // 最大连续空行数
  maxBlankLines: 2,
  // 是否过滤敏感信息
  filterSensitive: true,
  // 代码块最小保留行数
  minCodeLines: 1,
};

export class ContentFilter {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.seenContent = new Map(); // 用于检测重复内容
  }

  /**
   * 过滤内容
   * @param {string} content - 原始内容
   * @param {Object} options - 过滤选项
   * @returns {FilteredContent}
   */
  filter(content, options = {}) {
    const opts = { ...this.options, ...options };

    if (!content || typeof content !== 'string') {
      return {
        content: '',
        removed: [],
        stats: { originalLength: 0, filteredLength: 0, removedCount: 0 }
      };
    }

    let result = content;
    const removed = [];

    // 1. 清理空白
    if (opts.cleanWhitespace) {
      result = this.cleanWhitespace(result, opts.maxBlankLines);
    }

    // 2. 过滤模板化开头
    if (opts.filterTemplates) {
      const templateResult = this.removeTemplatePrefix(result);
      if (templateResult.removed) {
        removed.push(...templateResult.removed);
        result = templateResult.content;
      }
    }

    // 3. 移除冗余标记
    if (opts.filterTemplates) {
      const redundantResult = this.removeRedundantMarkers(result);
      if (redundantResult.removed.length > 0) {
        removed.push(...redundantResult.removed);
        result = redundantResult.content;
      }
    }

    // 4. 过滤重复内容
    if (opts.detectDuplicates) {
      const duplicateResult = this.removeDuplicates(result, opts);
      if (duplicateResult.removed.length > 0) {
        removed.push(...duplicateResult.removed);
        result = duplicateResult.content;
      }
    }

    // 5. 过滤敏感信息
    if (opts.filterSensitive) {
      const sensitiveResult = this.filterSensitiveInfo(result);
      if (sensitiveResult.removed.length > 0) {
        removed.push(...sensitiveResult.removed);
        result = sensitiveResult.content;
      }
    }

    // 6. 清理代码块
    result = this.cleanCodeBlocks(result);

    return {
      content: result.trim(),
      removed,
      stats: {
        originalLength: content.length,
        filteredLength: result.length,
        removedCount: removed.length,
        reductionRatio: content.length > 0 ? (1 - result.length / content.length).toFixed(2) : 0
      }
    };
  }

  /**
   * 清理空白字符
   */
  cleanWhitespace(content, maxBlankLines = 2) {
    let result = content;

    // 移除行尾空白
    result = result.replace(CODE_PATTERNS.trailingWhitespace, '');

    // 规范化连续空行
    const blankPattern = new RegExp(`\\n{${maxBlankLines + 1},}`, 'g');
    result = result.replace(blankPattern, '\n'.repeat(maxBlankLines));

    return result;
  }

  /**
   * 移除模板化开头
   */
  removeTemplatePrefix(content) {
    const lines = content.split('\n');
    let removed = [];
    let startIndex = 0;

    for (let i = 0; i < Math.min(3, lines.length); i++) {
      const line = lines[i].trim();
      const isTemplate = TEMPLATE_PATTERNS.some(pattern => pattern.test(line));

      if (isTemplate && !line.includes('```')) {
        removed.push({ type: 'template', content: lines[i] });
        startIndex = i + 1;
      } else {
        break;
      }
    }

    return {
      content: lines.slice(startIndex).join('\n'),
      removed
    };
  }

  /**
   * 移除冗余标记
   */
  removeRedundantMarkers(content) {
    let result = content;
    const removed = [];

    for (const pattern of REDUNDANT_MARKERS) {
      const matches = result.match(pattern);
      if (matches) {
        removed.push({ type: 'redundant', content: matches });
        result = result.replace(pattern, '');
      }
    }

    return { content: result, removed };
  }

  /**
   * 移除重复内容
   */
  removeDuplicates(content, options = {}) {
    const lines = content.split('\n');
    const uniqueLines = [];
    const seen = new Set();
    const removed = [];

    for (const line of lines) {
      const normalized = line.trim().toLowerCase();

      // 跳过空行
      if (!normalized) {
        uniqueLines.push(line);
        continue;
      }

      // 跳过代码块标记行
      if (normalized.startsWith('```') || normalized === '```') {
        uniqueLines.push(line);
        seen.clear(); // 重置代码块内的重复检测
        continue;
      }

      // 跳过注释行
      if (normalized.startsWith('//') || normalized.startsWith('#') || normalized.startsWith('/*') || normalized.startsWith('*')) {
        uniqueLines.push(line);
        continue;
      }

      if (!seen.has(normalized)) {
        seen.add(normalized);
        uniqueLines.push(line);
      } else {
        removed.push({ type: 'duplicate', content: line });
      }
    }

    return {
      content: uniqueLines.join('\n'),
      removed
    };
  }

  /**
   * 过滤敏感信息
   */
  filterSensitiveInfo(content) {
    let result = content;
    const removed = [];

    // 过滤 API Key 模式
    const apiKeyPatterns = [
      /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{20,}(?![A-Za-z0-9/+=])/g, // 长随机字符串
      /(?:api[_-]?key|apikey|secret|token|password)[=:]\s*['"]?[\w-]{20,}['"]?/gi,
    ];

    for (const pattern of apiKeyPatterns) {
      const matches = result.match(pattern);
      if (matches) {
        removed.push({ type: 'sensitive', content: '[REDACTED]' });
        result = result.replace(pattern, '[REDACTED]');
      }
    }

    // 过滤文件路径中的敏感信息
    result = result.replace(/\/home\/[^\/]+\//g, '/home/user/');
    result = result.replace(/C:\\Users\\[^\/]+\\/g, 'C:\\Users\\user\\');

    return { content: result, removed };
  }

  /**
   * 清理代码块
   */
  cleanCodeBlocks(content) {
    const lines = content.split('\n');
    const result = [];
    let inCodeBlock = false;
    let codeBlockStart = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 检测代码块开始
      if (line.trim().startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true;
          codeBlockStart = i;
          result.push(line);
        } else {
          // 代码块结束，检查是否需要保留
          const codeLines = i - codeBlockStart - 1;
          if (codeLines >= this.options.minCodeLines) {
            result.push(line);
          } else {
            // 移除过短的代码块
            result.splice(result.length - (i - codeBlockStart), codeBlockStart - result.length + 1);
          }
          inCodeBlock = false;
        }
      } else {
        result.push(line);
      }
    }

    return result.join('\n');
  }

  /**
   * 为会话添加内容跟踪（用于跨请求去重）
   */
  trackContent(sessionId, content) {
    if (!this.seenContent.has(sessionId)) {
      this.seenContent.set(sessionId, new Set());
    }
    this.seenContent.get(sessionId).add(this.hashContent(content));
  }

  /**
   * 检查内容是否已见过
   */
  hasSeen(sessionId, content) {
    const seen = this.seenContent.get(sessionId);
    if (!seen) return false;
    return seen.has(this.hashContent(content));
  }

  /**
   * 清除会话跟踪
   */
  clearSession(sessionId) {
    this.seenContent.delete(sessionId);
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

export default ContentFilter;
