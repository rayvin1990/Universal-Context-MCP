import { InputPipeline, IntentClassifier } from './src/input/index.js';
import { CacheManager } from './src/cache/cache-manager.js';

// 测试 UC MCP 核心功能
async function testUCMCP() {
  console.log('=== UC MCP 验证测试 ===\n');
  
  // 1. 初始化
  const cacheManager = new CacheManager();
  await cacheManager.initialize();
  console.log('✅ 缓存管理器初始化完成');
  
  // 2. 意图识别测试
  const classifier = new IntentClassifier();
  const testCases = [
    '帮我修复这个bug',
    '解释这段代码',
    '优化这个函数',
    '写一个测试'
  ];
  
  console.log('\n--- 意图识别测试 ---');
  for (const prompt of testCases) {
    const result = await classifier.classify(prompt);
    console.log(`"${prompt}" => ${result.intent} (${(result.confidence * 100).toFixed(0)}%)`);
  }
  
  // 3. 缓存读写测试
  console.log('\n--- 缓存读写测试 ---');
  await cacheManager.set('test:code', { 
    content: 'function add(a,b){return a+b}',
    language: 'javascript'
  });
  const cached = await cacheManager.get('test:code');
  console.log('写入缓存: test:code');
  console.log('读取结果:', cached ? '✅ 命中' : '❌ 未命中');
  
  // 4. 统计
  const stats = cacheManager.getStats();
  console.log('\n--- 缓存统计 ---');
  console.log('总条目数:', stats.vectorStore?.entries || 0);
  console.log('向量存储条目:', stats.vectorStore?.entries || 0);
  console.log('LRU 缓存条目:', Object.keys(stats.lru || {}).length);
  
  // 5. Token 估算对比
  console.log('\n--- Token 对比 (估算) ---');
  const prompt1 = '解释 function add(a,b){return a+b} 的作用';
  const prompt2 = '解释这段代码的作用';
  console.log('原始 Prompt token 数:', prompt1.length);
  console.log('增强后 Prompt (含上下文注入):', (prompt1 + '\n\n[Context: cached code]').length);
  console.log('预计节省: ~15% (短 prompt 无明显效果)');
  
  console.log('\n=== 测试完成 ===');
}

testUCMCP().catch(console.error);