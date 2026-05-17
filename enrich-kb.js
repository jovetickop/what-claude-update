// enrich-kb.js — 调用本地 Claude CLI 逐条为知识库条目生成真实使用指南
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const KB_PATH = path.join(__dirname, 'data', 'kb.json');
const ERROR_LOG = path.join(__dirname, 'data', 'enrich-errors.log');

// 用于存储当前活跃的 Claude 子进程，allow-Control-C 时关闭
let currentChild = null;

// 通用占位内容的特征模式
const GENERIC_PATTERNS = [
  '查看官方文档', '请参考 Claude Code', '升级后按需使用', '升级后此',
  '该功能涉及', '详情：', '更新了', '涉及 ', '关键词：',
  '此功能为新增，旧版本中不可用', '重启会话使修复生效', '升级后自动生效',
  '涉及', '运行 `claude doctor`', '升级后此项', '升级到最新'
];

function isGenericText(text) {
  if (!text || text.length < 5) return true;
  for (const p of GENERIC_PATTERNS) {
    if (text.includes(p)) return true;
  }
  // 检查是否以模板化开头
  if (/^(修复了|更新了|该功能|涉及|关键词|详情)/.test(text)) return true;
  return false;
}

function isPlaceholder(data) {
  const steps = data.usageSteps || [];
  const tips = data.tips || [];

  // 空内容 = 占位
  if (steps.length === 0) return true;

  // 所有 steps 和所有 tips 都是通用文本 = 占位
  const allStepsGeneric = steps.every(isGenericText);
  const allTipsGeneric = tips.length === 0 || tips.every(isGenericText);

  return allStepsGeneric && allTipsGeneric;
}

function log(msg) {
  const t = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  console.log(`[${t}] ${msg}`);
}

function buildPrompt(data) {
  const verbMap = {
    '新增': '如何使用此新功能',
    '修复': '此问题修复后如何使用',
    '优化': '此改进后如何使用',
    '变更': '此变更后如何使用',
    '移除': '移除后如何替代'
  };
  const verb = verbMap[data.changeType] || '如何使用';

  // 使用英文 prompt 发送给 Claude CLI，AI 对英文指令响应更好
  return `You are a Claude Code expert. Provide a practical usage guide with subagent based on the following feature information.

Feature: ${data.titleZh}
Description: ${data.descZh || data.titleZh}
Category: ${data.category || '其他'}
Type: ${data.changeType || '新增'}

Output strictly in the following JSON format (JSON only):
{
  "usageSteps": ["step 1", "step 2", "step 3"],
  "tips": ["tip 1", "tip 2"]
}

Requirements:
- Each usageStep: 15-60 Chinese characters, reference specific commands/keys/parameters/paths
- Each tip: 10-40 Chinese characters, point out limitations/pitfalls/tips
- Forbidden: "upgrade to latest version", "check official docs", "use /help" and other generic filler`;
}

async function main() {
  // 读取知识库
  let kb;
  try {
    kb = JSON.parse(fs.readFileSync(KB_PATH, 'utf8'));
  } catch (e) {
    log(`读取 kb.json 失败: ${e.message}`);
    process.exit(1);
  }

  const entries = Object.entries(kb);
  let ok = 0, skip = 0, fail = 0;
  let lastSave = Date.now();

  log(`知识库共 ${entries.length} 条，开始调用 Claude CLI...`);
  log('可随时 Ctrl+C 中断，已处理条目自动保存\n');

  for (let i = 0; i < entries.length; i++) {
    const [id, data] = entries[i];
    const done = i + 1;

    if (!isPlaceholder(data)) { skip++; continue; }

    const pct = `[${done}/${entries.length}]`;

    try {
      process.stdout.write(`${pct} ${data.introducedIn} ${data.titleZh.slice(0, 45)}... `);

      // 使用 spawn 替代 execSync，以便控制子进程生命周期
      const result = await new Promise((resolve, reject) => {
        const child = spawn('claude', ['-p', '-'], {
          encoding: 'utf8',
          timeout: 120000,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe']
        });
        currentChild = child;

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', d => { stdout += d; });
        child.stderr.on('data', d => { stderr += d; });

        child.on('error', err => {
          currentChild = null;
          reject(new Error(err.message));
        });

        child.on('close', code => {
          currentChild = null;
          if (code !== 0 && stderr) {
            reject(new Error(stderr.slice(0, 100)));
          } else {
            resolve(stdout);
          }
        });

        child.stdin.write(buildPrompt(data));
        child.stdin.end();
      });

      // 提取并解析 JSON
      let json;
      const codeMatch = result.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      const jsonStr = codeMatch ? codeMatch[1].trim() : (jsonMatch ? jsonMatch[0] : null);
      if (!jsonStr) throw new Error('响应中找不到JSON');
      json = JSON.parse(jsonStr);

      if (!json.usageSteps || !Array.isArray(json.usageSteps) || json.usageSteps.length === 0) {
        throw new Error('usageSteps 为空');
      }

      data.usageSteps = json.usageSteps;
      data.tips = Array.isArray(json.tips) ? json.tips : [];
      console.log('✅');
      ok++;
    } catch (e) {
      const msg = e.message.slice(0, 50).replace(/\n/g, ' ');
      console.log(`❌ ${msg}`);
      try {
        fs.appendFileSync(ERROR_LOG, `[${new Date().toISOString()}] ${id}: ${e.message}\n`, 'utf8');
      } catch (_) {}
      fail++;
    }

    // 每 15 秒或每 20 条保存一次
    const now = Date.now();
    if (ok > 0 && ok % 20 === 0 || (now - lastSave > 15000 && ok > 0)) {
      try {
        fs.writeFileSync(KB_PATH, JSON.stringify(kb, null, 2), 'utf8');
        lastSave = now;
      } catch (e) {
        log(`保存失败: ${e.message}`);
      }
    }
  }

  // 最终保存
  try {
    fs.writeFileSync(KB_PATH, JSON.stringify(kb, null, 2), 'utf8');
  } catch (e) {
    log(`最终保存失败: ${e.message}`);
  }

  console.log('\n========================================');
  log(`完成: ${ok} 成功 | ${skip} 跳过 | ${fail} 失败 | 总计 ${entries.length}`);
}

// ========== 清理子进程 ==========
function cleanup() {
  log('正在关闭 Claude 子进程...');
  if (currentChild) {
    currentChild.kill();
    currentChild = null;
  }
}
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });

main();