// Claude Code 版本追踪工具 — 主脚本
// 功能：从 npm 和 GitHub 获取版本数据，结合本地知识库生成 HTML 版本信息页
// 零外部依赖，仅使用 Node.js 内置模块

const fs = require('fs');
const path = require('path');

// ========== 配置 ==========
const SCRIPT_DIR = __dirname;
const DATA_DIR = path.join(SCRIPT_DIR, 'data');
const KB_PATH = path.join(DATA_DIR, 'kb.json');
const CACHE_PATH = path.join(DATA_DIR, 'versions-cache.json');
const OUTPUT_HTML = path.join(SCRIPT_DIR, 'claude-versions.html');

const NPM_PACKAGE = '@anthropic-ai/claude-code';
const GITHUB_RELEASES_API = 'https://api.github.com/repos/anthropics/claude-code/releases';
const GITHUB_PER_PAGE = 100;

// ========== 工具函数 ==========

/** 打印带时间戳的日志 */
function log(msg) {
  const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
  console.log(`[${time}] ${msg}`);
}

/** 安全的 fetch 封装，含超时 */
async function safeFetch(url, opts = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeout || 30000);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

/** 确保目录存在 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ========== 数据获取 ==========

/** 从 npm 获取所有版本号及其发布日期 */
async function fetchNpmVersions() {
  log('从 npm registry 获取版本列表...');
  try {
    const res = await safeFetch(`https://registry.npmjs.org/${NPM_PACKAGE}/`);
    const data = await res.json();
    const timeMap = data.time || {};
    const versions = [];
    for (const [ver, t] of Object.entries(timeMap)) {
      if (ver === 'created' || ver === 'modified') continue;
      versions.push({ version: ver, date: t.slice(0, 10), timestamp: t });
    }
    // 按日期倒序
    versions.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    log(`获取到 ${versions.length} 个版本 (npm)`);
    return versions;
  } catch (e) {
    log(`npm 请求失败: ${e.message}`);
    return null;
  }
}

/** 从 GitHub Releases API 获取所有 release notes（翻页） */
async function fetchGitHubReleases() {
  log('从 GitHub Releases 获取更新日志...');
  const allReleases = [];
  try {
    for (let page = 1; page <= 5; page++) {
      const res = await safeFetch(`${GITHUB_RELEASES_API}?per_page=${GITHUB_PER_PAGE}&page=${page}`);
      const releases = await res.json();
      if (!releases.length) break;
      allReleases.push(...releases);
      if (releases.length < GITHUB_PER_PAGE) break;
    }
    log(`获取到 ${allReleases.length} 个 GitHub release`);
    return allReleases;
  } catch (e) {
    log(`GitHub 请求失败: ${e.message}`);
    return null;
  }
}

// ========== 缓存管理 ==========

/** 读取本地缓存 */
function readCache() {
  if (fs.existsSync(CACHE_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    } catch (e) {
      log('缓存文件损坏，重新创建');
    }
  }
  return { lastUpdated: null, versions: {} };
}

/** 写入本地缓存 */
function writeCache(cache) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
}

/** 读取知识库 */
function readKB() {
  if (fs.existsSync(KB_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(KB_PATH, 'utf8'));
    } catch (e) {
      log('知识库文件损坏');
      return {};
    }
  }
  return {};
}

// ========== 数据处理 ==========

/** 解析 GitHub release notes 中的功能条目 */
function parseReleaseNotes(body) {
  if (!body) return [];
  const items = [];
  const lines = body.split('\n');

  let currentType = 'unknown';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith('## ')) continue; // 跳过标题

    // 检测子分类（如 "### Fixed", "### Added"）
    if (trimmed.startsWith('### ')) {
      const sub = trimmed.replace(/^### /, '').toLowerCase();
      if (sub.includes('fix') || sub.includes('修复')) currentType = '修复';
      else if (sub.includes('add') || sub.includes('new') || sub.includes('新增')) currentType = '新增';
      else if (sub.includes('improve') || sub.includes('update') || sub.includes('优化')) currentType = '优化';
      else if (sub.includes('change') || sub.includes('变更')) currentType = '变更';
      else if (sub.includes('remove') || sub.includes('deprecat')) currentType = '移除';
      else currentType = '变更';
      continue;
    }

    // 列表条目
    const match = trimmed.match(/^[-*]\s+(.+)/);
    if (match) {
      const text = match[1];
      // 判断类型关键词
      let type = currentType;
      const lower = text.toLowerCase();
      if (lower.startsWith('added') || lower.startsWith('新增')) type = '新增';
      else if (lower.startsWith('fixed') || lower.startsWith('修复') || lower.startsWith('fix')) type = '修复';
      else if (lower.startsWith('improved') || lower.startsWith('优化')) type = '优化';
      else if (lower.startsWith('removed') || lower.startsWith('移除')) type = '移除';

      items.push({ text, type });
    }
  }
  return items;
}

/** 尝试将功能条目匹配到知识库 */
function matchToKB(items, kb) {
  const kbEntries = Object.entries(kb);
  const result = [];
  const usedKBIds = new Set(); // 防止同一 KB 条目重复匹配

  for (const item of items) {
    let matched = false;
    const itemLower = item.text.toLowerCase();

    for (const [kbId, kbData] of kbEntries) {
      // 跳过已经在本版本中使用过的 KB 条目
      if (usedKBIds.has(kbId)) continue;

      // 优先用英文关键词匹配（精確匹配 GitHub release notes 原文）
      const enKeywords = kbData.enKeywords || [];
      if (enKeywords.length > 0) {
        const enMatchCount = enKeywords.filter(kw => itemLower.includes(kw.toLowerCase())).length;
        if (enMatchCount >= 1) {
          result.push({ type: 'kb', kbId, kbData });
          usedKBIds.add(kbId);
          matched = true;
          break;
        }
      }

      // 备用：用中文标题关键词匹配
      if (!matched) {
        const titleWords = (kbData.titleZh || '').split(/[\s\-，,、]/);
        const zhWords = titleWords.filter(w => w.length >= 2);
        const zhMatchCount = zhWords.filter(w => itemLower.includes(w.toLowerCase())).length;
        if (zhMatchCount >= 3) {
          result.push({ type: 'kb', kbId, kbData });
          usedKBIds.add(kbId);
          matched = true;
          break;
        }
      }
    }
    if (!matched) {
      // 未匹配到知识库的条目 — 尝试用描述性标签代替英文原文
      result.push({ type: 'raw', text: item.text, changeType: item.type });
    }
  }
  return result;
}

/** 主数据处理流程 */
async function processVersions() {
  // 1. 读取缓存和知识库
  const cache = readCache();
  const kb = readKB();
  const cachedVersions = new Set(Object.keys(cache.versions || {}));

  // 2. 获取 npm 版本数据
  const npmVersions = await fetchNpmVersions();
  if (!npmVersions) {
    log('无法获取 npm 数据，使用缓存生成');
    return { versions: cache.versions || {}, kb, fromCache: true };
  }

  // 3. 找出新版本
  const newVersions = npmVersions.filter(v => !cachedVersions.has(v.version));
  log(`缓存已有 ${cachedVersions.size} 个版本，${newVersions.length} 个新版本`);

  // 4. 获取 GitHub releases（只要有新版本就获取）
  let githubReleases = [];
  if (newVersions.length > 0) {
    const ghData = await fetchGitHubReleases();
    if (ghData) githubReleases = ghData;
  }

  // 5. 创建 GitHub release 查找映射
  const releaseMap = {};
  for (const rel of githubReleases) {
    // tag_name 可能带 v 前缀或不带
    const ver = rel.tag_name.replace(/^v/, '');
    releaseMap[ver] = rel;
  }

  // 6. 处理新版本
  let processedCount = 0;
  for (const v of newVersions) {
    const rel = releaseMap[v.version];
    const rawItems = rel ? parseReleaseNotes(rel.body) : [];
    const features = matchToKB(rawItems, kb);

    cache.versions[v.version] = {
      date: v.date,
      rawItems: rawItems.map(r => ({ text: r.text, type: r.type })),
      features
    };
    processedCount++;
  }
  log(`处理了 ${processedCount} 个新版本`);

  // 7. 更新缓存时间并保存
  cache.lastUpdated = new Date().toISOString();
  writeCache(cache);

  return { versions: cache.versions, kb, fromCache: false };
}

// ========== HTML 生成 ==========

/** HTML 转义 */
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 解析 Markdown 内联代码和链接为 HTML */
function parseInlineMarkdown(text) {
  return text
    // 行内代码
    .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
    // 粗体
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // 链接
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

/** 生成变更类型的样式标签 */
function typeTag(type) {
  const colors = {
    '新增': { bg: '#dcfce7', color: '#166534', emoji: '✨' },
    '修复': { bg: '#fee2e2', color: '#991b1b', emoji: '🐛' },
    '优化': { bg: '#dbeafe', color: '#1e40af', emoji: '🔧' },
    '变更': { bg: '#fef3c7', color: '#92400e', emoji: '📝' },
    '移除': { bg: '#fce7f3', color: '#9d174d', emoji: '🗑️' },
  };
  const c = colors[type] || colors['变更'];
  return `<span class="type-tag" style="background:${c.bg};color:${c.color}">${c.emoji} ${type}</span>`;
}

/** 生成功能卡片 HTML */
function renderFeatureCard(feature, version) {
  if (feature.type === 'kb' && feature.kbData) {
    const d = feature.kbData;
    const introVer = d.introducedIn || version;
    const introLabel = introVer === version ? `v${version} 新增` : `v${introVer} 引入`;
    const steps = d.usageSteps || [];
    const tips = d.tips || [];

    return `
    <div class="feature-card feature-kb">
      <div class="feature-header">
        <span class="feature-icon">${categoryIcon(d.category)}</span>
        <span class="feature-title">${esc(d.titleZh)}</span>
        <span class="feature-badge badge-new">${introLabel}</span>
        ${typeTag(d.changeType || '新增')}
      </div>
      <div class="feature-body">
        <p class="feature-desc">${esc(d.descZh)}</p>
        ${steps.length ? `
        <div class="feature-usage">
          <div class="usage-label">💡 使用指南</div>
          <ol class="usage-steps">
            ${steps.map(s => `<li>${parseInlineMarkdown(esc(s))}</li>`).join('')}
          </ol>
        </div>` : ''}
        ${tips.length ? `
        <div class="feature-tips">
          <div class="tips-label">⚠️ 注意事项</div>
          <ul class="tips-list">
            ${tips.map(t => `<li>${esc(t)}</li>`).join('')}
          </ul>
        </div>` : ''}
      </div>
    </div>`;
  } else {
    // 原始条目（未匹配知识库）
    return `
    <div class="feature-card feature-raw">
      <div class="feature-header">
        <span class="feature-icon">📌</span>
        <span class="feature-title">${parseInlineMarkdown(esc(feature.text))}</span>
        ${typeTag(feature.changeType || feature.type || '变更')}
      </div>
    </div>`;
  }
}

/** 分类图标 */
function categoryIcon(cat) {
  const icons = {
    '插件系统': '🔌',
    'Agent 系统': '🤖',
    'CLI 命令': '⌨️',
    '工作树': '🌲',
    '终端体验': '🖥️',
    '认证与安全': '🔐',
    '模型与性能': '⚡',
    '权限控制': '🛡️',
    'Hook 系统': '🪝',
    'MCP 集成': '🔗',
    '工具改进': '🛠️',
    '安全沙箱': '📦',
    '配置管理': '⚙️',
    '安装与更新': '📥',
    '稳定性': '💪',
  };
  return icons[cat] || '📋';
}

/** 按分类分组功能卡片 */
function groupByCategory(features, version) {
  const groups = {};
  for (const f of features) {
    let cat;
    if (f.type === 'kb' && f.kbData) {
      cat = f.kbData.category || '其他';
    } else {
      cat = '其他变更';
    }
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(f);
  }
  return groups;
}

/** 获取主版本号（如 v2, v1, v0） */
function majorVer(version) {
  const m = version.match(/^(\d+)\./);
  return m ? `v${m[1]}.x` : 'unknown';
}

/** 生成完整 HTML */
function generateHTML(data) {
  const { versions, kb, fromCache } = data;
  const versionList = Object.entries(versions)
    .sort(([, a], [, b]) => (b.date || '').localeCompare(a.date || ''));

  const latestVersion = versionList[0]?.[0] || '?';
  const latestDate = versionList[0]?.[1]?.date || '?';
  const today = new Date().toISOString().slice(0, 10);

  // 获取主要版本号列表
  const majors = [...new Set(versionList.map(([v]) => majorVer(v)))];

  // 功能知识库条目列表（用于搜索提示）
  const kbItems = Object.entries(kb || {}).map(([id, d]) => ({
    id, titleZh: d.titleZh, category: d.category, introducedIn: d.introducedIn
  }));

  // 统计
  const totalVersions = versionList.length;
  const firstVersion = versionList[versionList.length - 1];
  const firstDate = firstVersion?.[1]?.date || '?';

  // 生成版本卡片
  const versionCards = versionList.map(([ver, info], idx) => {
    const date = info.date || '未知日期';
    const isLatest = idx === 0;
    const features = info.features || [];
    const rawItems = info.rawItems || [];
    const major = majorVer(ver);

    // 如果有知识库匹配的功能，按分类分组
    const hasKB = features.some(f => f.type === 'kb');
    const groups = hasKB ? groupByCategory(features, ver) : null;

    // 中文内容：KB 匹配卡片 + 未匹配条目提示
    let zhHTML = '';
    const kbFeatures = features.filter(f => f.type === 'kb');
    const rawFeatures = features.filter(f => f.type === 'raw');
    const hasKBItems = kbFeatures.length > 0;
    const hasRawItems = rawFeatures.length > 0;

    if (hasKBItems) {
      const kbGroups = groupByCategory(kbFeatures, ver);
      zhHTML = Object.entries(kbGroups).map(([cat, items]) => `
        <div class="category-group">
          <div class="category-header">${categoryIcon(cat)} ${esc(cat)} (${items.length} 项变更)</div>
          ${items.map(f => renderFeatureCard(f, ver)).join('')}
        </div>
      `).join('');
    }
    // 对于未匹配知识库的条目，在中文模式下提示用户切换到英文查看原文
    if (hasRawItems) {
      zhHTML += `
        <div class="category-group raw-pending">
          <div class="category-header">📋 其他更新 (${rawFeatures.length} 项) — 中文说明编写中</div>
          <div class="raw-pending-hint">
            💡 这些功能的中文使用指南正在编写中，可切换到 <a href="javascript:toggleLang()" style="color:var(--accent);text-decoration:underline">英文模式</a> 查看原始说明。
          </div>
          <div class="raw-items-preview">
            ${rawFeatures.map(r => `
              <div class="feature-card feature-raw-pending">
                <span class="raw-text">${parseInlineMarkdown(esc(r.text))}</span>
                ${typeTag(r.changeType || '变更')}
              </div>
            `).join('')}
          </div>
        </div>`;
    }
    if (!hasKBItems && !hasRawItems) {
      zhHTML = '<div class="no-features">此版本暂无详细功能记录，后续版本将逐步补充</div>';
    }

    // 英文内容：原始 GitHub release notes（结构化展示）
    let enHTML = '';
    if (rawItems.length > 0) {
      enHTML = `
        <div class="category-group">
          <div class="category-header">📋 Changes (${rawItems.length} items)</div>
          ${rawItems.map(r => `
            <div class="feature-card feature-raw-item">
              <div class="feature-header">
                <span class="feature-title">${parseInlineMarkdown(esc(r.text))}</span>
                ${typeTag(r.type || 'Changed')}
              </div>
            </div>
          `).join('')}
        </div>`;
    } else {
      enHTML = '<div class="no-features">No release notes available for this version</div>';
    }

    return `
    <div class="version-card ${isLatest ? 'version-latest' : ''}"
         data-version="${esc(ver)}"
         data-major="${major}"
         data-date="${date}"
         data-content="${esc((info.rawItems || []).map(r => r.text).join(' ') + ' ' + ver)}">
      <div class="version-header">
        <div class="version-info">
          <span class="version-number">v${esc(ver)}</span>
          ${isLatest ? '<span class="version-latest-tag">🆕 最新 / Latest</span>' : ''}
          <span class="version-date">📅 ${date}</span>
          <span class="version-major-tag">${major}</span>
        </div>
        <button class="expand-btn" onclick="this.closest('.version-card').classList.toggle('expanded')">
          展开详情 / Expand ▼
        </button>
      </div>
      <div class="version-body">
        <div class="zh-content">${zhHTML}</div>
        <div class="en-content" style="display:none">${enHTML}</div>
      </div>
    </div>`;
  }).join('\n');

  // HTML 模板
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Claude Code 版本更新追踪</title>
<style>
  /* ====== 基础变量 ====== */
  :root {
    --bg: #f8fafc;
    --card-bg: #ffffff;
    --text: #1e293b;
    --text-secondary: #64748b;
    --border: #e2e8f0;
    --accent: #d97706;
    --accent-light: #fef3c7;
    --code-bg: #1e293b;
    --code-text: #e2e8f0;
    --shadow: 0 1px 3px rgba(0,0,0,.08), 0 1px 2px rgba(0,0,0,.06);
    --shadow-lg: 0 4px 12px rgba(0,0,0,.1);
    --radius: 12px;
    --radius-sm: 8px;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f172a;
      --card-bg: #1e293b;
      --text: #f1f5f9;
      --text-secondary: #94a3b8;
      --border: #334155;
      --accent: #f59e0b;
      --accent-light: #422006;
      --shadow: 0 1px 3px rgba(0,0,0,.3);
      --shadow-lg: 0 4px 12px rgba(0,0,0,.4);
    }
  }

  /* ====== 全局 ====== */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.6;
    min-height: 100vh;
  }

  /* ====== 头部 ====== */
  .header {
    background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 50%, #1e3a5f 100%);
    color: #f1f5f9;
    padding: 32px 24px;
    text-align: center;
    position: sticky;
    top: 0;
    z-index: 100;
    box-shadow: 0 2px 8px rgba(0,0,0,.2);
  }
  .header h1 {
    font-size: 1.8rem;
    font-weight: 700;
    margin-bottom: 8px;
    letter-spacing: .02em;
  }
  .header-meta {
    font-size: .9rem;
    opacity: .85;
    display: flex;
    justify-content: center;
    gap: 24px;
    flex-wrap: wrap;
    align-items: center;
  }
  .header-meta span { white-space: nowrap; }
  .header-meta .cache-note {
    background: rgba(255,255,255,.2);
    padding: 2px 10px;
    border-radius: 20px;
    font-size: .8rem;
  }

  /* 语言切换按钮 */
  .lang-toggle {
    background: rgba(255,255,255,.15);
    color: #f1f5f9;
    border: 1px solid rgba(255,255,255,.3);
    padding: 4px 14px;
    border-radius: 16px;
    cursor: pointer;
    font-size: .8rem;
    font-weight: 600;
    transition: all .2s;
    white-space: nowrap;
  }
  .lang-toggle:hover { background: rgba(255,255,255,.25); }

  /* 语言内容显示控制 */
  body.lang-zh .zh-content { display: block; }
  body.lang-zh .en-content { display: none; }
  body.lang-en .zh-content { display: none; }
  body.lang-en .en-content { display: block; }
  body.lang-zh .zh-only { display: inline; }
  body.lang-en .zh-only { display: none; }

  /* ====== 统计栏 ====== */
  .stats-bar {
    max-width: 1100px;
    margin: 20px auto;
    padding: 0 20px;
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .stat-item {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 12px 20px;
    text-align: center;
    min-width: 100px;
    box-shadow: var(--shadow);
  }
  .stat-value { font-size: 1.3rem; font-weight: 700; color: var(--accent); }
  .stat-label { font-size: .75rem; color: var(--text-secondary); margin-top: 2px; }

  /* ====== 工具栏 ====== */
  .toolbar {
    max-width: 1100px;
    margin: 0 auto 20px;
    padding: 0 20px;
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    align-items: center;
    position: sticky;
    top: 130px;
    z-index: 50;
    background: var(--bg);
    padding-top: 12px;
    padding-bottom: 12px;
  }
  .search-box {
    flex: 1;
    min-width: 200px;
    padding: 10px 16px;
    border: 2px solid var(--border);
    border-radius: 24px;
    font-size: .9rem;
    background: var(--card-bg);
    color: var(--text);
    outline: none;
    transition: border-color .2s;
  }
  .search-box:focus { border-color: var(--accent); }
  .filter-btn {
    padding: 8px 16px;
    border: 2px solid var(--border);
    border-radius: 20px;
    background: var(--card-bg);
    color: var(--text);
    cursor: pointer;
    font-size: .85rem;
    transition: all .15s;
    white-space: nowrap;
  }
  .filter-btn:hover { border-color: var(--accent); }
  .filter-btn.active {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
  .filter-count {
    font-size: .75rem;
    background: var(--border);
    padding: 1px 6px;
    border-radius: 10px;
    margin-left: 4px;
  }

  /* ====== 版本列表 ====== */
  .version-list {
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 20px 40px;
  }

  /* ====== 版本卡片 ====== */
  .version-card {
    background: var(--card-bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    margin-bottom: 16px;
    box-shadow: var(--shadow);
    transition: box-shadow .2s;
    overflow: hidden;
  }
  .version-card:hover { box-shadow: var(--shadow-lg); }
  .version-card.version-latest {
    border-color: var(--accent);
    border-width: 2px;
  }

  .version-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    cursor: pointer;
    user-select: none;
  }
  .version-info {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .version-number {
    font-size: 1.1rem;
    font-weight: 700;
    font-family: "SF Mono", "Cascadia Code", "Fira Code", monospace;
  }
  .version-latest-tag {
    background: var(--accent);
    color: #fff;
    padding: 2px 10px;
    border-radius: 12px;
    font-size: .75rem;
    font-weight: 600;
  }
  .version-date {
    color: var(--text-secondary);
    font-size: .85rem;
  }
  .version-major-tag {
    background: var(--border);
    padding: 2px 8px;
    border-radius: 10px;
    font-size: .72rem;
    color: var(--text-secondary);
    font-family: monospace;
  }
  .expand-btn {
    padding: 6px 14px;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--card-bg);
    color: var(--accent);
    cursor: pointer;
    font-size: .8rem;
    transition: all .15s;
    white-space: nowrap;
  }
  .expand-btn:hover { background: var(--accent); color: #fff; border-color: var(--accent); }

  /* 版本内容 */
  .version-body {
    display: none;
    padding: 0 20px 20px;
    border-top: 1px solid var(--border);
  }
  .version-card.expanded .version-body { display: block; }
  .version-card.expanded .expand-btn { display: none; }

  /* ====== 分类组 ====== */
  .category-group {
    margin-top: 12px;
  }
  .category-header {
    font-size: .9rem;
    font-weight: 600;
    color: var(--text-secondary);
    padding: 8px 0;
    border-bottom: 1px dashed var(--border);
    margin-bottom: 10px;
  }

  /* ====== 功能卡片 ====== */
  .feature-card {
    background: color-mix(in srgb, var(--bg) 60%, var(--card-bg));
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 14px 16px;
    margin-bottom: 10px;
    transition: border-color .15s;
  }
  .feature-card:hover { border-color: var(--accent); }
  .feature-kb { border-left: 4px solid var(--accent); }
  .feature-raw { border-left: 4px solid var(--text-secondary); opacity: .8; }
  .feature-raw-item { border-left: 3px solid var(--border); }

  .feature-header {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 6px;
  }
  .feature-icon { font-size: 1.1rem; }
  .feature-title {
    font-weight: 600;
    font-size: .95rem;
    flex: 1;
    min-width: 150px;
  }
  .feature-badge {
    padding: 1px 8px;
    border-radius: 10px;
    font-size: .7rem;
    font-weight: 500;
  }
  .badge-new { background: #dcfce7; color: #166534; }

  .type-tag {
    padding: 1px 8px;
    border-radius: 10px;
    font-size: .72rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .feature-body { margin-top: 8px; }
  .feature-desc {
    font-size: .9rem;
    line-height: 1.6;
    color: var(--text);
    margin-bottom: 10px;
  }

  /* 使用指南 */
  .feature-usage {
    background: #f0f9ff;
    border-radius: var(--radius-sm);
    padding: 12px 16px;
    margin: 10px 0;
  }
  @media (prefers-color-scheme: dark) {
    .feature-usage { background: #0f1f2e; }
  }
  .usage-label, .tips-label {
    font-size: .82rem;
    font-weight: 600;
    margin-bottom: 6px;
    color: #0369a1;
  }
  @media (prefers-color-scheme: dark) {
    .usage-label, .tips-label { color: #7dd3fc; }
  }
  .usage-steps {
    padding-left: 20px;
    margin: 0;
  }
  .usage-steps li {
    font-size: .85rem;
    margin-bottom: 4px;
    color: var(--text);
  }

  .feature-tips {
    background: #fffbeb;
    border-radius: var(--radius-sm);
    padding: 10px 16px;
    margin: 8px 0;
  }
  @media (prefers-color-scheme: dark) {
    .feature-tips { background: #2a1f00; }
  }
  .tips-list {
    padding-left: 18px;
    margin: 0;
    font-size: .82rem;
    color: var(--text-secondary);
  }
  .tips-list li { margin-bottom: 2px; }

  /* 行内代码 */
  .inline-code {
    background: var(--code-bg);
    color: #fbbf24;
    padding: 1px 6px;
    border-radius: 4px;
    font-family: "SF Mono", "Cascadia Code", "Fira Code", monospace;
    font-size: .85em;
  }

  /* 旧版本 */
  .collapsed-old { opacity: .7; }
  .old-items-summary {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 0;
  }
  .old-item-chip {
    background: var(--border);
    padding: 2px 10px;
    border-radius: 12px;
    font-size: .78rem;
    color: var(--text-secondary);
  }
  .old-item-more {
    font-size: .78rem;
    color: var(--text-secondary);
    align-self: center;
  }

  .no-features {
    color: var(--text-secondary);
    font-size: .85rem;
    font-style: italic;
    padding: 10px 0;
  }

  /* 待补充中文说明的条目 */
  .raw-pending { opacity: .85; }
  .raw-pending-hint {
    font-size: .82rem;
    color: var(--text-secondary);
    padding: 6px 0 10px;
    font-style: italic;
  }
  .raw-pending-hint a { cursor: pointer; }
  .feature-card.feature-raw-pending {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-left: 2px dashed var(--border);
    background: var(--card-bg);
    flex-wrap: wrap;
  }
  .feature-raw-pending .raw-text {
    flex: 1;
    font-size: .82rem;
    color: var(--text);
    min-width: 200px;
  }
  .raw-items-preview {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  /* ====== 页脚 ====== */
  .footer {
    max-width: 1100px;
    margin: 0 auto;
    padding: 20px;
    text-align: center;
    color: var(--text-secondary);
    font-size: .78rem;
    border-top: 1px solid var(--border);
  }

  /* ====== 响应式 ====== */
  @media (max-width: 768px) {
    .header h1 { font-size: 1.4rem; }
    .header-meta { gap: 10px; font-size: .8rem; }
    .toolbar { top: 115px; }
    .version-header { padding: 12px 14px; }
    .version-body { padding: 0 14px 14px; }
    .feature-header { gap: 4px; }
    .feature-title { font-size: .85rem; }
  }
</style>
</head>
<body class="lang-zh">

<!-- 头部 -->
<header class="header">
  <h1>🚀 Claude Code 版本更新追踪</h1>
  <div class="header-meta">
    <span>📅 数据更新：${today}</span>
    <span>🏷️ 最新版本：v${latestVersion}</span>
    <span>📅 发布日期：${latestDate}</span>
    <button class="lang-toggle" onclick="toggleLang()" id="langBtn" title="切换语言 / Switch Language">
      🌐 中 / EN
    </button>
    ${fromCache ? '<span class="cache-note">⚠️ 离线模式 — 使用缓存数据</span>' : ''}
  </div>
</header>

<!-- 统计栏 -->
<div class="stats-bar">
  <div class="stat-item">
    <div class="stat-value">${totalVersions}</div>
    <div class="stat-label">收录版本</div>
  </div>
  <div class="stat-item">
    <div class="stat-value">v${latestVersion}</div>
    <div class="stat-label">最新版本</div>
  </div>
  <div class="stat-item">
    <div class="stat-value">${firstDate}</div>
    <div class="stat-label">首个版本日期</div>
  </div>
  <div class="stat-item">
    <div class="stat-value">${Object.keys(kb || {}).length}</div>
    <div class="stat-label">知识库条目</div>
  </div>
</div>

<!-- 工具栏 -->
<div class="toolbar" id="toolbar">
  <input type="text" class="search-box" id="searchBox"
         placeholder="🔍 搜索版本号或功能... 例如: plugin, agent, 插件, hook"
         oninput="filterVersions()">
  <button class="filter-btn active" data-filter="all" onclick="setFilter('all', this)">全部版本<span class="filter-count">${totalVersions}</span></button>
  ${majors.map((m, i) => {
    const count = versionList.filter(([v]) => majorVer(v) === m).length;
    const isActive = i === 0 ? ' active' : '';
    return `<button class="filter-btn${isActive}" data-filter="${m}" onclick="setFilter('${m}', this)">${m}<span class="filter-count">${count}</span></button>`;
  }).join('\n  ')}
</div>

<!-- 版本列表 -->
<div class="version-list" id="versionList">
  ${versionCards}
</div>

<!-- 页脚 -->
<footer class="footer">
  <p>数据来源：npm registry (@anthropic-ai/claude-code) &amp; GitHub Releases (anthropics/claude-code)</p>
  <p>生成时间：${new Date().toLocaleString('zh-CN')} | 功能知识库持续完善中</p>
</footer>

<script>
  // ====== 语言切换 ======
  function toggleLang() {
    const body = document.body;
    const btn = document.getElementById('langBtn');
    if (body.classList.contains('lang-zh')) {
      body.classList.remove('lang-zh');
      body.classList.add('lang-en');
      btn.innerHTML = '🌐 EN / 中';
    } else {
      body.classList.remove('lang-en');
      body.classList.add('lang-zh');
      btn.innerHTML = '🌐 中 / EN';
    }
  }

  // ====== 过滤和搜索逻辑 ======
  let currentFilter = 'all';

  function setFilter(filter, btn) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filterVersions();
  }

  function filterVersions() {
    const query = document.getElementById('searchBox').value.toLowerCase().trim();
    const cards = document.querySelectorAll('.version-card');

    cards.forEach(card => {
      const major = card.dataset.major;
      const content = card.dataset.content.toLowerCase();
      const version = card.dataset.version.toLowerCase();

      const matchFilter = currentFilter === 'all' || major === currentFilter;
      const matchSearch = !query || version.includes(query) || content.includes(query);

      card.style.display = (matchFilter && matchSearch) ? '' : 'none';
    });

    // 更新计数
    const visible = [...cards].filter(c => c.style.display !== 'none').length;
    document.querySelector('.filter-btn.active .filter-count').textContent = visible;
  }

  // 默认展开最新版本
  document.querySelector('.version-latest')?.classList.add('expanded');
</script>
</body>
</html>`;
}

// ========== 主流程 ==========

async function main() {
  console.log('═══════════════════════════════════');
  console.log('  Claude Code 版本追踪工具');
  console.log('═══════════════════════════════════');

  ensureDir(DATA_DIR);

  // 处理版本数据
  const data = await processVersions();

  // 生成 HTML
  log('生成 HTML 页面...');
  const html = generateHTML(data);
  fs.writeFileSync(OUTPUT_HTML, html, 'utf8');

  const fileSizeKB = (fs.statSync(OUTPUT_HTML).size / 1024).toFixed(1);
  log(`✅ 已生成: ${OUTPUT_HTML} (${fileSizeKB} KB)`);

  const from = data.fromCache ? '(离线缓存)' : '(在线更新)';
  log(`完成！收录 ${Object.keys(data.versions).length} 个版本 ${from}`);
}

main().catch(err => {
  console.error('❌ 执行失败:', err.message);
  console.error(err.stack);
  process.exit(1);
});
