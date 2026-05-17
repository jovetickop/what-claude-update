# 🚀 What Claude Update — Claude Code 版本更新追踪器

> 一键生成 Claude Code CLI 所有版本的更新详述，含中文使用指南和示例。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

## 📖 简介

**What Claude Update** 是一款零依赖的版本追踪工具。双击 `update.bat`，自动联网获取 Claude Code 从诞生至今所有版本的更新日志，生成精美 HTML 网页——每个功能都配有**中文说明、使用指南和实操示例**，让你再也不错过任何新功能。

![截图示例](example.png)

## ✨ 核心特性

| 特性 | 说明 |
|------|------|
| 🔄 **一键更新** | 双击 `update.bat`，自动获取最新版本数据并打开浏览器 |
| 📦 **增量同步** | 已缓存的版本永久保留，每次只获取新增版本，秒级完成 |
| 🇨🇳 **全中文界面** | 完整中文界面，功能说明和使用指南全部为中文，降低阅读门槛 |
| 🃏 **功能卡片** | 每个功能独立卡片，按分类分组（插件系统、Agent、CLI命令、工作树……） |
| 💡 **使用示例** | 2100+ 条功能均含 AI 生成的使用步骤和实用提示 |
| 🔍 **智能搜索** | 搜索版本号或功能名，实时过滤；支持 v0.x / v1.x / v2.x 主版本筛选 |
| ⚡ **懒加载展开** | 滚动停止 0.5 秒后自动展开可见版本；只保持一个版本展开，浏览更流畅 |
| 🎨 **深色模式** | 自动跟随系统深色/浅色主题 |
| ⚡ **零依赖** | 仅使用 Node.js 内置模块，无需 npm install |

## 🚀 快速开始

### 环境要求

- **Node.js >= 18**（内置 `fetch`，无需额外安装）
- **网络连接**（首次运行需访问 npm registry 和 GitHub API）

### 安装与运行

```bash
# 1. 克隆仓库
git clone https://github.com/jovetickop/what-claude-update.git
cd what-claude-update

# 2. 双击运行 update.bat（获取版本数据 + 生成 HTML）
update.bat

# 3. （可选）双击 enrich-kb.bat（调用本地 Claude CLI 为每条功能生成真实使用指南）
enrich-kb.bat
```

首次运行约需 15 秒（获取 409 个版本 + 112 个 release notes），之后每次运行仅需 3 秒（增量检查）。

## 📊 数据来源

| 来源 | 用途 | 更新频率 |
|------|------|----------|
| [npm registry](https://www.npmjs.com/package/@anthropic-ai/claude-code) | 409 个版本号 + 发布日期 | 每次运行 |
| [GitHub Releases](https://github.com/anthropics/claude-code/releases) | 112 个版本的详细更新日志 | 有新版本时 |
| 本地 `kb.json` | 2100+ 条功能的中文说明和 AI 生成的使用指南 | 运行 `enrich-kb.bat` 自动充实 |

## 📁 项目结构

```
what-claude-update/
├── update.bat              # 入口（双击）— 获取版本数据 + 生成 HTML
├── enrich-kb.bat           # AI 知识库充实工具（双击）— 调用 Claude CLI 生成真实内容
├── enrich-kb.js            # 充实脚本核心，逐条调用本地 Claude CLI
├── generate.js             # 核心生成脚本
├── claude-versions.html    # ← 生成的网页输出（浏览器打开）
├── data/
│   ├── kb.json             # 知识库（2100+ 条目，含中文使用指南）
│   └── versions-cache.json # 版本缓存（增量更新基础）
└── README.md
```

## 🔧 知识库贡献

### AI 自动充实

运行 `enrich-kb.bat` 调用本地 Claude CLI，为每条功能特性自动生成具体的使用步骤和注意事项，替换通用占位文本。

```bash
# 双击 enrich-kb.bat，或：
node enrich-kb.js
```

逐条处理，每处理一条自动保存，可随时中断续跑。

### 手动添加

按以下格式在 `data/kb.json` 中新增条目即可，下次运行自动生效。

```json
{
  "plugin-dependency": {
    "titleZh": "插件依赖管理",
    "introducedIn": "2.1.143",
    "category": "插件系统",
    "changeType": "新增",
    "descZh": "Claude Code 现在会自动检查插件之间的依赖关系...",
    "usageSteps": [
      "查看已安装插件：claude plugin list",
      "启用插件：claude plugin enable <plugin-name>"
    ],
    "tips": ["被依赖的插件无法直接禁用，需先禁用所有依赖它的插件"]
  }
}
```

## 📝 版本收录范围

| 主版本 | 版本数 | 时间范围 |
|--------|--------|----------|
| v2.x | 193 | 2025-12 ~ 至今 |
| v1.x | 121 | 2025-07 ~ 2025-12 |
| v0.x | 95 | 2025-02 ~ 2025-07 |

## 🤝 许可

MIT License
