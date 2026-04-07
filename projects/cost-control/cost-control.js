#!/usr/bin/env node
/**
 * CostGuard CLI - AI 智能体成本控制命令行工具
 * 
 * **免责声明**：成本仅供参考，真实成本请依据各平台订阅使用量计算。
 *
 * Usage:
 *   cost-control init          - 初始化配置
 *   cost-control dashboard    - 显示成本面板
 *   cost-control today        - 今日成本
 *   cost-control week         - 本周成本
 *   cost-control month        - 本月成本
 *   cost-control report      - 生成报表
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// 配置路径
const CONFIG_DIR = path.join(os.homedir(), '.costguard');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const DATA_FILE = path.join(CONFIG_DIR, 'data.json');

// 默认配置
const DEFAULT_CONFIG = {
  version: '1.0.0',
  budget: {
    daily: 5,
    monthly: 30
  },
  prices: {
    'claude-code': 0.000003,
    'codex': 0.000003,
    'glm-5': 0.000002,
    'deepseek': 0.000003,
    'qwen3.5': 0.000002,
    'minimax': 0.000004,
    'kimi': 0.000004,
    'gpt-4': 0.00003,
    'gpt-3.5': 0.000002
  },
  alert: {
    warning: 0.8,
    emergency: 0.95
  },
  notification: {
    webhook: ''
  },
  created: new Date().toISOString()
};

// 颜色输出（不依赖 chalk，保持轻量）
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function colorize(text, color) {
  return `${colors[color] || ''}${text}${colors.reset}`;
}

// 本地日期格式化（避免 UTC 时区问题）
function toLocalDate(date = new Date()) {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}

// 工具函数
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadConfig() {
  ensureConfigDir();
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch (e) {
      return DEFAULT_CONFIG;
    }
  }
  return DEFAULT_CONFIG;
}

function saveConfig(config) {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
      return { records: [] };
    }
  }
  return { records: [] };
}

function saveData(data) {
  ensureConfigDir();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// 命令实现
async function cmdInit(args) {
  console.log(colorize('🚀 CostGuard 初始化', 'cyan'));
  console.log('-----------------------------------');

  const config = loadConfig();

  // 检查是否已初始化
  if (config.created && config.created !== DEFAULT_CONFIG.created) {
    console.log(colorize('⚠️  已存在配置，是否重新初始化?', 'yellow'));

    // 非 TTY 环境直接使用 --force 行为
    const answer = args.includes('--force') || !isTTY() ? 'y' : await rlConfirm('重新初始化? (y/N)', false);
    if (answer.toLowerCase() !== 'y') {
      console.log(colorize('❌ 已取消', 'red'));
      return;
    }
  }

  // 保存默认配置
  saveConfig(DEFAULT_CONFIG);
  console.log(colorize('✅ 配置已保存到: ' + CONFIG_FILE, 'green'));

  // 初始化数据文件
  saveData({ records: [] });
  console.log(colorize('✅ 数据文件已创建: ' + DATA_FILE, 'green'));

  console.log('-----------------------------------');
  console.log(colorize('✨ 初始化完成!', 'green'));
  console.log('使用 cost-control dashboard 查看成本');
}

function cmdDashboard(args) {
  console.log(colorize('📊 CostGuard 成本面板', 'cyan'));
  console.log('===================================\n');

  const config = loadConfig();
  const data = loadData();

  // 今日数据
  const today = toLocalDate(new Date());
  const todayRecords = data.records.filter(r => r.date === today);
  const todayCost = todayRecords.reduce((sum, r) => {
    const price = config.prices[r.model] || 0.000003;
    return sum + (r.cost || (r.tokens || 0) * price);
  }, 0);

  // 本周数据
  const weekStart = getWeekStart(new Date());
  const weekRecords = data.records.filter(r => r.date >= weekStart);
  const weekCost = weekRecords.reduce((sum, r) => {
    const price = config.prices[r.model] || 0.000003;
    return sum + (r.cost || (r.tokens || 0) * price);
  }, 0);

  // 本月数据
  const monthStart = getMonthStart(new Date());
  const monthRecords = data.records.filter(r => r.date >= monthStart);
  const monthCost = monthRecords.reduce((sum, r) => {
    const price = config.prices[r.model] || 0.000003;
    return sum + (r.cost || (r.tokens || 0) * price);
  }, 0);

  // 打印统计
  console.log(colorize('💰 成本概览', 'bright'));
  console.log(`  今日: ${colorize('$' + todayCost.toFixed(4), 'green')} (${todayRecords.length} 次请求)`);
  console.log(`  本周: ${colorize('$' + weekCost.toFixed(4), 'green')} (${weekRecords.length} 次请求)`);
  console.log(`  本月: ${colorize('$' + monthCost.toFixed(4), 'green')} (${monthRecords.length} 次请求)`);
  console.log('');

  // 预算使用
  console.log(colorize('📈 预算使用', 'bright'));
  const dailyUsage = (todayCost / config.budget.daily * 100).toFixed(1);
  const monthlyUsage = (monthCost / config.budget.monthly * 100).toFixed(1);
  console.log(`  日预算: $${config.budget.daily} (使用 ${dailyUsage}%)`);
  console.log(`  月预算: $${config.budget.monthly} (使用 ${monthlyUsage}%)`);
  console.log('');

  // 模型分布
  if (data.records.length > 0) {
    console.log(colorize('🔧 模型使用', 'bright'));
    const modelStats = {};
    for (const r of data.records) {
      const model = r.model || 'unknown';
      modelStats[model] = (modelStats[model] || 0) + 1;
    }
    for (const [model, count] of Object.entries(modelStats)) {
      const cost = data.records.filter(r => r.model === model).reduce((sum, r) => sum + (r.cost || (r.tokens || 0) * (config.prices[model] || 0.000003)), 0);
      console.log(`  ${model}: ${count} 次 ($ ${cost.toFixed(4)})`);
    }
  }

  console.log('\n===================================');
  console.log(`配置: ${CONFIG_FILE}`);
}

function cmdToday(args) {
  const config = loadConfig();
  const data = loadData();
  const today = toLocalDate(new Date());
  const records = data.records.filter(r => r.date === today);

  console.log(colorize(`📅 今日成本 (${today})`, 'cyan'));
  console.log('-----------------------------------');

  if (records.length === 0) {
    console.log(colorize('暂无数据', 'yellow'));
    return;
  }

  let total = 0;
  for (const r of records) {
    const price = config.prices[r.model] || 0.000003;
    const cost = (r.cost || (r.tokens || 0) * price);
    total += cost;
    const time = r.timestamp ? r.timestamp.split('T')[1].split('.')[0] : '--:--:--';
    console.log(`  ${time} ${r.model || 'unknown'} ${r.tokens || 0} tokens = $${cost.toFixed(4)}`);
  }
  console.log('-----------------------------------');
  console.log(colorize(`总计: $${total.toFixed(4)}`, 'green'));
}

function cmdWeek(args) {
  const config = loadConfig();
  const data = loadData();
  const weekStart = getWeekStart(new Date());
  const records = data.records.filter(r => r.date >= weekStart);

  console.log(colorize(`📅 本周成本 (${weekStart} ~ ${toLocalDate(new Date())})`, 'cyan'));
  console.log('-----------------------------------');

  if (records.length === 0) {
    console.log(colorize('暂无数据', 'yellow'));
    return;
  }

  // 按日期汇总
  const byDate = {};
  for (const r of records) {
    const date = r.date;
    const price = config.prices[r.model] || 0.000003;
    byDate[date] = (byDate[date] || 0) + (r.cost || (r.tokens || 0) * price);
  }

  for (const [date, cost] of Object.entries(byDate)) {
    console.log(`  ${date}: $${cost.toFixed(4)}`);
  }
  console.log('-----------------------------------');
  const total = Object.values(byDate).reduce((a, b) => a + b, 0);
  console.log(colorize(`总计: $${total.toFixed(4)}`, 'green'));
}

function cmdMonth(args) {
  const config = loadConfig();
  const data = loadData();
  const monthStart = getMonthStart(new Date());
  const records = data.records.filter(r => r.date >= monthStart);

  console.log(colorize(`📅 本月成本`, 'cyan'));
  console.log('-----------------------------------');

  if (records.length === 0) {
    console.log(colorize('暂无数据', 'yellow'));
    return;
  }

  // 按日期汇总
  const byDate = {};
  for (const r of records) {
    const date = r.date;
    const price = config.prices[r.model] || 0.000003;
    byDate[date] = (byDate[date] || 0) + (r.cost || (r.tokens || 0) * price);
  }

  for (const [date, cost] of Object.entries(byDate)) {
    console.log(`  ${date}: $${cost.toFixed(4)}`);
  }
  console.log('-----------------------------------');
  const total = Object.values(byDate).reduce((a, b) => a + b, 0);
  console.log(colorize(`总计: $${total.toFixed(4)}`, 'green'));
}

/**
 * 计算7天移动平均值
 */
function get7DayAverage(data) {
  const dailyTotals = {};
  const dailyCounts = {};

  for (const r of data.records) {
    const date = r.date;
    dailyTotals[date] = (dailyTotals[date] || 0) + (r.tokens || 0);
    dailyCounts[date] = (dailyCounts[date] || 0) + 1;
  }

  const sortedDates = Object.keys(dailyTotals).sort();
  const averages = {};

  for (let i = 0; i < sortedDates.length; i++) {
    const currentDate = sortedDates[i];
    const startIdx = Math.max(0, i - 6);
    const relevantDates = sortedDates.slice(startIdx, i + 1);

    let sum = 0, count = 0;
    for (const d of relevantDates) {
      sum += dailyTotals[d];
      count += dailyCounts[d];
    }

    averages[currentDate] = count > 0 ? sum / count : 0;
  }

  return averages;
}

/**
 * 检测异常消耗（超过7天平均值×2）
 */
function detectAnomalies(data) {
  const averages = get7DayAverage(data);
  const anomalies = [];
  const config = loadConfig();

  for (const r of data.records) {
    const avg = averages[r.date] || 0;
    if (avg > 0 && r.tokens > avg * 2) {
      const price = config.prices[r.model] || 0.000003;
      anomalies.push({
        ...r,
        cost: (r.tokens * price).toFixed(4),
        threshold: Math.round(avg * 2),
        exceedRatio: ((r.tokens - avg * 2) / (avg * 2) * 100).toFixed(1)
      });
    }
  }

  return anomalies;
}

/**
 * 发送预警通知
 */
async function sendAlert(anomalies) {
  if (anomalies.length === 0) return;

  const config = loadConfig();
  const webhook = config.notification?.webhook;

  // 如果配置了 webhook，发送飞书通知
  if (webhook) {
    try {
      const message = {
        msg_type: 'post',
        content: {
          post: {
            zh_cn: {
              title: '🚨 CostGuard 异常消耗预警',
              content: [
                [
                  { tag: 'text', text: `检测到 ${anomalies.length} 条异常消耗记录:\n` }
                ],
                ...anomalies.slice(0, 5).map(a => [
                  { tag: 'text', text: `• ${a.executor || 'unknown'}: ${a.tokens} tokens (超出 ${a.exceedRatio}%)\n` }
                ])
              ]
            }
          }
        }
      };

      const https = require('https');
      const postData = JSON.stringify(message);

      const req = https.request(webhook, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, res => {
        if (res.statusCode === 200) {
          console.log(colorize('✅ 飞书通知已发送', 'green'));
        }
      });

      req.write(postData);
      req.end();
    } catch (err) {
      console.log(colorize('⚠️ 通知发送失败: ' + err.message, 'yellow'));
    }
  } else {
    console.log(colorize('⚠️ 未配置 webhook，跳过通知', 'yellow'));
  }
}

function cmdAlert(args) {
  const data = loadData();
  const anomalies = detectAnomalies(data);

  console.log(colorize('🚨 异常消耗检测', 'red'));
  console.log('===================================\n');

  if (anomalies.length === 0) {
    console.log(colorize('✅ 未检测到异常消耗', 'green'));
    console.log('阈值: 7天平均值 × 2');
    return;
  }

  console.log(colorize(`检测到 ${anomalies.length} 条异常记录:`, 'yellow'));
  console.log('');

  for (const a of anomalies) {
    const executor = a.executor || 'unknown';
    const model = a.model || 'unknown';
    const time = a.timestamp ? a.timestamp.split('T')[1]?.split('.')[0] : '--:--:--';

    console.log(`  [${a.date} ${time}]`);
    console.log(`    Agent: ${executor}`);
    console.log(`    Model: ${model}`);
    console.log(`    Tokens: ${colorize(a.tokens, 'red')} (阈值: ${a.threshold})`);
    console.log(`    Cost: $${a.cost}`);
    console.log(`    超出阈值: ${colorize(a.exceedRatio + '%', 'red')}`);
    console.log('');
  }

  console.log('===================================');
  console.log(`阈值规则: 7天移动平均值 × 2`);

  // 自动发送通知
  if (args.includes('--notify')) {
    sendAlert(anomalies);
  }
}

// 辅助函数
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return toLocalDate(d);
}

function getMonthStart(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}

function prompt(question) {
  return new Promise(resolve => {
    process.stdout.write(question);
    process.stdin.once('data', data => {
      resolve(data.toString().trim());
    });
  });
}

// 主入口
function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  switch (command) {
    case 'init':
      cmdInit(args).catch(console.error);
      break;
    case 'dashboard':
    case 'dash':
      cmdDashboard(args);
      break;
    case 'today':
      cmdToday(args);
      break;
    case 'week':
      cmdWeek(args);
      break;
    case 'month':
      cmdMonth(args);
      break;
    case 'alert':
      cmdAlert(args);
      break;
    case 'stop':
      cmdStop(args);
      break;
    case 'start':
      cmdStart(args);
      break;
    case 'budget':
      cmdBudget(args);
      break;
    case 'guide':
      cmdGuide(args).catch(console.error);
      break;
    case 'help':
    case '--help':
    case '-h':
    default:
      console.log(`
${colorize('CostGuard - AI 智能体成本控制', 'cyan')}

${colorize('用法:', 'bright')} cost-control <命令> [选项]

${colorize('命令:', 'bright')}
  init          初始化配置
  dashboard     显示成本面板 (简写: dash)
  today         查看今日成本
  week          查看本周成本
  month         查看本月成本
  alert         查看异常消耗 (支持 --notify 发送通知)
  budget        查看/设置预算
  stop <id>     暂停指定 Agent
  start <id>    恢复指定 Agent
  guide         新手引导 (交互式)
  help          显示帮助

${colorize('选项:', 'bright')}
  --force       强制执行 (用于 init)

${colorize('示例:', 'bright')}
  cost-control init --force
  cost-control dashboard
  cost-control today
      `.trim());
  }
}

// 导出供测试
module.exports = { cmdInit, cmdDashboard, cmdToday, cmdWeek, cmdMonth, cmdAlert, detectAnomalies, get7DayAverage, cmdStop, cmdStart, cmdBudget, cmdGuide };

// 添加 stop 命令
function cmdStop(args) {
  const agentId = args[1];
  if (!agentId) {
    console.log(colorize('错误: 请指定 Agent ID', 'red'));
    console.log('用法: cost-control stop <agent-id>');
    return;
  }

  const config = loadConfig();
  if (!config.pausedAgents) {
    config.pausedAgents = [];
  }
  if (!config.pausedAgents.includes(agentId)) {
    config.pausedAgents.push(agentId);
    saveConfig(config);
  }

  console.log(colorize('✅ 已暂停 Agent: ' + agentId, 'green'));
}

// 添加 start 命令
function cmdStart(args) {
  const agentId = args[1];
  const config = loadConfig();

  if (!agentId) {
    // 显示所有已暂停的 Agent
    const paused = config.pausedAgents || [];
    console.log(colorize('⏸ 已暂停的 Agent:', 'yellow'));
    if (paused.length === 0) {
      console.log('  (无)');
    } else {
      for (const id of paused) {
        console.log('  ' + id);
      }
    }
    console.log('用法: cost-control start <agent-id>');
    return;
  }

  if (config.pausedAgents) {
    config.pausedAgents = config.pausedAgents.filter(id => id !== agentId);
    saveConfig(config);
  }

  console.log(colorize('✅ 已恢复 Agent: ' + agentId, 'green'));
}

// 添加 budget 命令
function cmdBudget(args) {
  const config = loadConfig();

  if (args[1] === 'set') {
    const daily = parseFloat(args[2]);
    const monthly = args[3] ? parseFloat(args[3]) : undefined;

    if (isNaN(daily)) {
      console.log(colorize('错误: 请输入有效的金额', 'red'));
      return;
    }

    config.budget.daily = daily;
    if (monthly !== undefined) {
      config.budget.monthly = monthly;
    }
    saveConfig(config);

    console.log(colorize('✅ 预算已更新', 'green'));
    console.log(`  每日: $${daily}`);
    if (monthly !== undefined) {
      console.log(`  每月: $${monthly}`);
    }
    return;
  }

  // 显示当前预算
  console.log(colorize('💰 当前预算设置', 'cyan'));
  console.log('-----------------------------------');
  console.log(`  每日: $${config.budget.daily}`);
  console.log(`  每月: $${config.budget.monthly}`);
  console.log('-----------------------------------');
  console.log('设置预算: cost-control budget set <金额> [每月]');
}

// 检测是否在 TTY 环境
function isTTY() {
  return process.stdin.isTTY && process.stdout.isTTY;
}

// 使用 readline 的简化选择菜单
function rlSelect(question, options) {
  return new Promise(resolve => {
    const rl = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log(question);
    options.forEach((opt, i) => console.log(`  ${i + 1}. ${opt}`));

    rl.question('\n请选择 (1-' + options.length + '): ', answer => {
      const choice = parseInt(answer.trim());
      rl.close();
      resolve(isNaN(choice) || choice < 1 || choice > options.length ? 1 : choice);
    });
  });
}

// 使用 readline 的确认问答
function rlConfirm(question, defaultVal = true) {
  return new Promise(resolve => {
    const rl = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const defStr = defaultVal ? 'Y/n' : 'y/N';
    rl.question(`${question} (${defStr}): `, answer => {
      rl.close();
      const val = answer.trim().toLowerCase();
      resolve(val === '' ? defaultVal : val === 'y' || val === 'yes');
    });
  });
}

// 使用 readline 的输入问答
function rlInput(question, defaultVal = '') {
  return new Promise(resolve => {
    const rl = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const prefix = defaultVal ? `(${defaultVal})` : '';
    rl.question(`${question} ${prefix}: `, answer => {
      rl.close();
      resolve(answer.trim() || defaultVal);
    });
  });
}

// 添加 guide 命令 (交互式新手引导)
async function cmdGuide(args) {
  // 检测 TTY 环境
  if (!isTTY()) {
    console.log(colorize('⚠️  检测到非交互式环境', 'yellow'));
    console.log('guide 命令需要在终端中运行，请直接使用以下命令:\n');
    console.log('  cost-control init          - 初始化配置');
    console.log('  cost-control dashboard    - 查看成本面板');
    console.log('  cost-control budget set 3 - 设置每日预算 $3');
    console.log('');
    return;
  }

  console.log(colorize('🎓 CostGuard 新手引导', 'cyan'));
  console.log('===================================\n');

  // 欢迎
  const welcome = await rlConfirm('欢迎使用 CostGuard！准备好开始了吗？', true);

  if (!welcome) {
    console.log('\n随时运行 ' + colorize('cost-control guide', 'cyan') + ' 重新开始\n');
    return;
  }

  // 步骤 1: 预算设置
  console.log('\n📌 步骤 1: 设置预算');
  const dailyInput = await rlInput('请设置每日预算 ($)', '3');
  const daily = parseFloat(dailyInput);

  if (!isNaN(daily) && daily > 0) {
    const config = loadConfig();
    config.budget.daily = daily;
    saveConfig(config);
    console.log(colorize(`✅ 每日预算已设置为: $${daily}`, 'green'));
  } else {
    console.log(colorize('⚠️ 输入无效，将使用默认值 $3', 'yellow'));
  }

  // 步骤 2: 常用命令 (显示菜单)
  console.log('\n📌 步骤 2: 常用命令');
  const cmdChoice = await rlSelect('你想了解哪个命令?', [
    'dashboard - 查看成本面板',
    'today - 今日成本',
    'week - 本周成本',
    'month - 本月成本',
    'alert - 异常检测',
    'budget - 查看/设置预算',
    '跳过'
  ]);

  if (cmdChoice >= 1 && cmdChoice <= 6) {
    const cmdHelp = [
      'dashboard: 显示今日/本周/本月成本概览、预算使用率、模型分布',
      'today: 查看今日每次 API 调用的详细成本记录',
      'week: 查看本周每日成本汇总',
      'month: 查看本月每日成本汇总',
      'alert: 检测异常消耗 (超过 7 天平均值 × 2)',
      'budget: 查看或设置每日/每月预算'
    ];
    console.log(`\n  💡 ${cmdHelp[cmdChoice - 1]}`);
  }

  // 步骤 3: 预警机制
  console.log('\n📌 步骤 3: 预警机制');
  console.log('  • 使用率 80% 时发出警告');
  console.log('  • 使用率 95% 时触发紧急提醒');

  // 步骤 4: 完成
  console.log(colorize('\n✅ 引导完成！', 'green'));
  console.log('输入 cost-control dashboard 开始使用\n');
}

// 直接运行
if (require.main === module) {
  main();
}