/**
 * Output Pipeline - 输出侧模块公共入口
 *
 * 包含:
 * - ContentFilter: 内容过滤（去除冗余、重复）
 * - Summarizer: LLM 摘要压缩
 * - OutputPipeline: 主管道（整合过滤+摘要+缓存）
 */

export { ContentFilter } from './content-filter.js';
export { Summarizer, SummarizationError } from './summarizer.js';
export { OutputPipeline, OutputPipelineError } from './output-pipeline.js';

export default {
  ContentFilter,
  Summarizer,
  OutputPipeline,
};