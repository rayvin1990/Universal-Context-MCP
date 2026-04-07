/**
 * Vector store abstraction.
 * Uses an in-memory lexical index by default and can optionally talk to Chroma.
 */

const DEFAULT_OPTIONS = {
  backend: 'file',  // 改默认用文件存储
  endpoint: 'http://localhost:8000',
  collectionName: 'universal-context',
  persistPath: './data/vector-store.json',
};

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function overlapScore(queryTokens, docTokens) {
  if (queryTokens.length === 0 || docTokens.length === 0) {
    return 0;
  }

  const docSet = new Set(docTokens);
  let hits = 0;
  for (const token of queryTokens) {
    if (docSet.has(token)) {
      hits += 1;
    }
  }
  return hits / Math.max(queryTokens.length, docSet.size);
}

export class VectorStore {
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.records = new Map();
    this.client = null;
    this.collection = null;
    this.initialized = false;
    this.backend = 'memory';
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    if (this.options.backend === 'chroma') {
      await this.#initializeChroma();
    } else if (this.options.backend === 'file') {
      await this.#initializeFile();
    }

    this.initialized = true;
  }

  async #initializeFile() {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const { fileURLToPath } = await import('url');
      
      const dirname = path.dirname(fileURLToPath(import.meta.url));
      const dataDir = path.join(dirname, '..', '..', 'data');
      this.persistPath = path.resolve(dataDir, 'vector-store.json');
      
      // 确保目录存在
      await fs.mkdir(dataDir, { recursive: true });
      
      // 加载已有数据
      try {
        const data = await fs.readFile(this.persistPath, 'utf-8');
        const parsed = JSON.parse(data);
        for (const [id, record] of Object.entries(parsed)) {
          this.records.set(id, record);
        }
        console.error('Loaded', this.records.size, 'records from file');
      } catch {
        // 文件不存在，从头开始
        console.error('Starting with empty vector store');
      }
      
      this.backend = 'file';
    } catch (e) {
      console.error('File storage init failed:', e.message);
      this.backend = 'memory';
    }
  }

  async #persistToFile() {
    if (this.backend !== 'file' || !this.persistPath) return;
    
    try {
      const fs = await import('fs/promises');
      const data = {};
      for (const [id, record] of this.records) {
        data[id] = record;
      }
      await fs.writeFile(this.persistPath, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('Failed to persist:', e.message);
    }
  }

  async add(entries) {
    await this.ensureInitialized();

    for (const entry of entries) {
      const record = this.#normalizeRecord(entry);
      this.records.set(record.id, record);
    }

    if (this.collection) {
      await this.#upsertChroma(entries);
    }
    
    // 文件存储持久化
    if (this.backend === 'file') {
      await this.#persistToFile();
    }
  }

  async get(id) {
    await this.ensureInitialized();
    const record = this.records.get(id);
    return record ? record.value : null;
  }

  async search(query, options = {}) {
    await this.ensureInitialized();

    const queryTokens = tokenize(query);
    const limit = options.limit ?? options.topK ?? 5;
    const filter = options.filter || {};
    const results = [];

    for (const record of this.records.values()) {
      if (!this.#matchesFilter(record.metadata, filter)) {
        continue;
      }

      const score = overlapScore(queryTokens, record.tokens);
      if (score <= 0) {
        continue;
      }

      results.push({
        id: record.id,
        text: record.text,
        content: record.value?.content ?? record.value,
        value: record.value,
        metadata: record.metadata,
        score,
        similarity: score,
        file: record.metadata?.file,
        path: record.metadata?.path,
        line: record.metadata?.line,
      });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async delete(ids) {
    await this.ensureInitialized();

    for (const id of ids) {
      this.records.delete(id);
    }

    if (this.collection && ids.length > 0) {
      await this.collection.delete({ ids });
    }
  }

  async clear() {
    await this.ensureInitialized();

    const ids = Array.from(this.records.keys());
    this.records.clear();

    if (this.collection && ids.length > 0) {
      await this.collection.delete({ ids });
    }
  }

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  isAvailable() {
    return this.initialized;
  }

  getStats() {
    return {
      backend: this.backend,
      entries: this.records.size,
      chromaEnabled: Boolean(this.collection),
    };
  }

  #normalizeRecord(entry) {
    const value = entry.value ?? entry.document ?? entry.content ?? entry.text;
    const text = entry.text || this.#extractSearchText(value);
    return {
      id: entry.id,
      text,
      tokens: tokenize(text),
      value,
      metadata: { ...(entry.metadata || {}) },
    };
  }

  #extractSearchText(value) {
    if (typeof value === 'string') {
      return value;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  #matchesFilter(metadata, filter) {
    for (const [key, expected] of Object.entries(filter)) {
      if (expected === undefined) {
        continue;
      }
      if (metadata?.[key] !== expected) {
        return false;
      }
    }
    return true;
  }

  async #initializeChroma() {
    try {
      const { ChromaClient } = await import('chromadb');
      this.client = new ChromaClient({ path: this.options.endpoint });
      this.collection = await this.client.getOrCreateCollection({
        name: this.options.collectionName,
      });
      this.backend = 'chroma';
    } catch {
      this.client = null;
      this.collection = null;
      this.backend = 'memory';
    }
  }

  async #upsertChroma(entries) {
    const documents = [];
    const ids = [];
    const metadatas = [];

    for (const entry of entries) {
      const record = this.#normalizeRecord(entry);
      ids.push(record.id);
      documents.push(record.text);
      metadatas.push(record.metadata);
    }

    await this.collection.upsert({
      ids,
      documents,
      metadatas,
    });
  }
}

export default VectorStore;
