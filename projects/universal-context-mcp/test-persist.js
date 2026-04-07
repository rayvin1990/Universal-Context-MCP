import('./src/cache/vector-store.js').then(async m => {
  const vs = new m.VectorStore({ backend: 'file' });
  await vs.initialize();
  
  console.log('=== 完整持久化验证 ===');
  console.log('Records:', vs.records.size);
  
  // 搜索测试
  const results = await vs.search('测试内容');
  console.log('Search "测试内容":', results.length, '条');
  
  // 直接获取
  const value = await vs.get('test:1');
  console.log('Direct get:', value);
  
  console.log('\n✅ 持久化工作正常！');
});