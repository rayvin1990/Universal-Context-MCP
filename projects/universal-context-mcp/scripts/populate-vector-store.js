/**
 * 向量存储数据填充脚本
 * 将实际项目代码和文档添加到向量存储中
 */

import { CacheManager } from '../src/cache/cache-manager.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * 读取项目文件并提取内容
 */
async function readProjectFiles(projectPath) {
  const files = [];
  const extensions = ['.js', '.ts', '.md', '.json', '.txt'];

  async function scanDir(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // 跳过 node_modules 和隐藏文件
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }

      if (entry.isDirectory()) {
        await scanDir(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const relativePath = path.relative(projectPath, fullPath);

            files.push({
              path: relativePath,
              content: content.substring(0, 10000), // 限制长度
              type: ext,
              size: content.length
            });
          } catch (err) {
            console.warn(`无法读取文件 ${fullPath}:`, err.message);
          }
        }
      }
    }
  }

  await scanDir(projectPath);
  return files;
}

/**
 * 将文件内容分块
 */
function chunkContent(file, chunkSize = 1000) {
  const chunks = [];
  const lines = file.content.split('\n');
  let currentChunk = '';
  let lineNumber = 1;

  for (const line of lines) {
    if (currentChunk.length + line.length > chunkSize && currentChunk.length > 0) {
      chunks.push({
        id: `${file.path}#${lineNumber}`,
        text: currentChunk,
        value: {
          path: file.path,
          content: currentChunk,
          line: lineNumber,
          type: file.type
        },
        metadata: {
          projectPath: 'universal-context-mcp',
          file: file.path,
          line: lineNumber,
          type: file.type,
          size: file.size
        }
      });

      currentChunk = line;
      lineNumber += currentChunk.split('\n').length;
    } else {
      currentChunk += (currentChunk ? '\n' : '') + line;
    }
  }

  // 添加最后一个块
  if (currentChunk.trim()) {
    chunks.push({
      id: `${file.path}#${lineNumber}`,
      text: currentChunk,
      value: {
        path: file.path,
        content: currentChunk,
        line: lineNumber,
        type: file.type
      },
      metadata: {
        projectPath: 'universal-context-mcp',
        file: file.path,
        line: lineNumber,
        type: file.type,
        size: file.size
      }
    });
  }

  return chunks;
}

/**
 * 填充向量存储
 */
async function populateVectorStore() {
  console.log('=== Universal Context MCP 向量存储数据填充 ===\n');

  try {
    // 1. 初始化缓存管理器
    console.log('1. 初始化缓存管理器...');
    const cacheManager = new CacheManager({
      lru: { ttlMs: 3600000, maxEntries: 1000 },
      vector: { enabled: true, backend: 'memory' }
    });
    await cacheManager.initialize();
    console.log('   ✅ 缓存管理器初始化成功\n');

    // 2. 读取项目文件
    console.log('2. 读取项目文件...');
    const projectPath = process.cwd();
    const files = await readProjectFiles(projectPath);
    console.log(`   ✅ 读取 ${files.length} 个文件\n`);

    // 3. 分块处理
    console.log('3. 分块处理文件内容...');
    const allChunks = [];
    for (const file of files) {
      const chunks = chunkContent(file);
      allChunks.push(...chunks);
    }
    console.log(`   ✅ 生成 ${allChunks.length} 个文本块\n`);

    // 4. 添加到向量存储
    console.log('4. 添加到向量存储...');
    const vectorStore = cacheManager.getVectorStore();
    let addedCount = 0;
    const batchSize = 50;

    for (let i = 0; i < allChunks.length; i += batchSize) {
      const batch = allChunks.slice(i, i + batchSize);
      await vectorStore.add(batch);
      addedCount += batch.length;
      console.log(`   → 已添加 ${addedCount}/${allChunks.length} 个块`);
    }

    console.log(`   ✅ 向量存储填充完成，共 ${addedCount} 个块\n`);

    // 5. 测试搜索
    console.log('5. 测试搜索功能...');
    const testQueries = [
      'cache manager implementation',
      'intent classifier',
      'project resolver',
      'MCP server',
      'vector store'
    ];

    for (const query of testQueries) {
      console.log(`\n   查询: "${query}"`);
      const results = await vectorStore.search(query, {
        filter: { projectPath: 'universal-context-mcp' },
        limit: 3
      });

      if (results.length > 0) {
        console.log(`   找到 ${results.length} 个结果:`);
        for (const result of results) {
          console.log(`     - ${result.file}:${result.line} (得分: ${result.score.toFixed(3)})`);
        }
      } else {
        console.log(`   未找到相关结果`);
      }
    }

    // 6. 测试缓存集成
    console.log('\n6. 测试缓存集成...');
    const testContext = {
      agent: 'test-agent',
      projectPath: 'universal-context-mcp',
      sessionId: 'populate-test'
    };

    const cacheKey = cacheManager.buildKey('test search cache', testContext);
    const cachedResult = await cacheManager.get(cacheKey, testContext);
    console.log(`   缓存测试: ${cachedResult ? '命中' : '未命中'}`);

    // 7. 保存统计信息
    console.log('\n7. 保存统计信息...');
    const stats = cacheManager.getStats();
    const statsFile = path.join(projectPath, 'vector-store-stats.json');
    await fs.writeFile(statsFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      files: files.length,
      chunks: allChunks.length,
      cacheStats: stats,
      fileTypes: files.reduce((acc, file) => {
        acc[file.type] = (acc[file.type] || 0) + 1;
        return acc;
      }, {})
    }, null, 2));

    console.log(`   ✅ 统计信息已保存到 ${statsFile}\n`);

    console.log('🎉 向量存储数据填充完成！');
    console.log('\n📊 统计摘要:');
    console.log(`   - 文件数: ${files.length}`);
    console.log(`   - 文本块数: ${allChunks.length}`);
    console.log(`   - 缓存命中率: ${(stats.hitRate * 100).toFixed(1)}%`);
    console.log(`   - 向量存储条目: ${stats.vectorEntries || 0}`);

    return true;

  } catch (error) {
    console.error('❌ 数据填充失败:', error.message);
    console.error(error.stack);
    return false;
  }
}

// 运行填充
const success = await populateVectorStore();
process.exit(success ? 0 : 1);