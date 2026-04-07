/**
 * Hybrid context retriever.
 * Combines simple lexical file search with the shared cache/vector layers.
 */

import { glob } from 'glob';
import { readFileSync } from 'fs';
import { join } from 'path';

export class ContextRetriever {
  constructor(options = {}) {
    this.options = {
      maxResults: 10,
      similarityThreshold: 0.3,
      useHybrid: true,
      bm25Weight: 0.3,
      vectorWeight: 0.7,
      ...options,
    };
    this.vectorStore = null;
    this.cacheManager = null;
    this.invertedIndex = new Map();
  }

  async initialize(vectorStore = null, cacheManager = null) {
    this.vectorStore = vectorStore;
    this.cacheManager = cacheManager;
    await this.buildInvertedIndex();
  }

  async buildInvertedIndex() {
    return undefined;
  }

  async retrieve(query, context = {}) {
    const load = async () => {
      const results = [];

      if (this.options.bm25Weight > 0) {
        const bm25Results = await this.bm25Search(query, context);
        results.push(...bm25Results);
      }

      if (this.vectorStore && this.options.vectorWeight > 0) {
        const vectorResults = await this.vectorSearch(query, context);
        results.push(...vectorResults);
      }

      return this.mergeResults(results).slice(0, this.options.maxResults);
    };

    if (!this.cacheManager) {
      return load();
    }

    return this.cacheManager.getOrSet(
      JSON.stringify({
        type: 'context-retrieve',
        query,
        projectPath: context.projectPath || '',
        intent: context.intent || '',
        filter: context.filter || {},
      }),
      load,
      {
        scope: {
          agent: context.agent,
          project: context.project || context.projectPath,
          sessionId: context.sessionId,
        },
        text: query,
        cacheType: 'retrieved-context',
        metadata: {
          projectPath: context.projectPath,
          intent: context.intent,
        },
        ttlMs: context.ttlMs,
      }
    );
  }

  async bm25Search(query, context) {
    const results = [];
    const queryTerms = this.tokenize(query);

    if (!context.projectPath) {
      return results;
    }

    const files = await this.getRelevantFiles(context.projectPath, query);

    for (const file of files) {
      try {
        const content = readFileSync(file.path, 'utf-8');
        const score = this.calculateBM25Score(queryTerms, content);

        if (score > 0) {
          results.push({
            source: 'bm25',
            file: file.path,
            content: this.extractRelevantSnippet(content, query),
            score,
            line: this.findMatchingLine(content, query),
          });
        }
      } catch {
        // Ignore unreadable files.
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, 5);
  }

  async vectorSearch(query, context) {
    if (!this.vectorStore) {
      return [];
    }

    try {
      const results = await this.vectorStore.search(query, {
        limit: this.options.maxResults,
        filter: {
          ...(context.filter || {}),
          ...(context.projectPath ? { projectPath: context.projectPath } : {}),
        },
      });

      return results.map((result) => ({
        source: 'vector',
        file: result.file || result.path,
        content: result.content ?? result.text,
        score: result.similarity || result.score,
        line: result.line,
      }));
    } catch {
      return [];
    }
  }

  tokenize(text) {
    return String(text)
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 0);
  }

  calculateBM25Score(queryTerms, content) {
    const contentLower = content.toLowerCase();
    let score = 0;

    for (const term of queryTerms) {
      const regex = new RegExp(term, 'gi');
      const matches = contentLower.match(regex);
      if (matches) {
        score += matches.length;
      }
    }

    return score / Math.max(1, content.length / 1000);
  }

  async getRelevantFiles(projectPath, query) {
    const queryTerms = this.tokenize(query);
    const sourceFiles = await glob(join(projectPath, 'src/**/*.js'), {
      ignore: ['**/node_modules/**'],
    });

    const fileScores = [];

    for (const file of sourceFiles) {
      try {
        const content = readFileSync(file, 'utf-8');
        let score = 0;

        for (const term of queryTerms) {
          if (content.toLowerCase().includes(term)) {
            score += 1;
          }
        }

        if (score > 0) {
          fileScores.push({ path: file, score });
        }
      } catch {
        // Ignore unreadable files.
      }
    }

    return fileScores.sort((a, b) => b.score - a.score).slice(0, 10);
  }

  extractRelevantSnippet(content, query) {
    const lines = content.split('\n');
    const queryTerms = this.tokenize(query);

    let bestLine = 0;
    let bestScore = 0;

    for (let index = 0; index < lines.length; index += 1) {
      const lineLower = lines[index].toLowerCase();
      let score = 0;

      for (const term of queryTerms) {
        if (lineLower.includes(term)) {
          score += 1;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestLine = index;
      }
    }

    const start = Math.max(0, bestLine - 2);
    const end = Math.min(lines.length, bestLine + 3);
    return lines.slice(start, end).join('\n');
  }

  findMatchingLine(content, query) {
    const queryTerms = this.tokenize(query);
    const lines = content.split('\n');

    for (let index = 0; index < lines.length; index += 1) {
      const lineLower = lines[index].toLowerCase();
      for (const term of queryTerms) {
        if (lineLower.includes(term)) {
          return index + 1;
        }
      }
    }

    return 1;
  }

  mergeResults(results) {
    const merged = new Map();

    for (const result of results) {
      const key = result.file;
      const existing = merged.get(key);

      if (!existing) {
        merged.set(key, result);
        continue;
      }

      const totalWeight = this.options.bm25Weight + this.options.vectorWeight;
      existing.score = (existing.score * totalWeight + result.score) / (totalWeight * 2);
      existing.sources = [...(existing.sources || [existing.source]), result.source];
    }

    return Array.from(merged.values()).sort((a, b) => b.score - a.score);
  }

  setVectorStore(vectorStore) {
    this.vectorStore = vectorStore;
  }

  setCacheManager(cacheManager) {
    this.cacheManager = cacheManager;
  }
}

export default ContextRetriever;
