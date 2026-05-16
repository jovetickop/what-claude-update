# 🚀 What Claude Update — Claude Code 版本更新追踪器

> 一键生成 Claude Code CLI 所有版本的更新详述，含中文使用指南和示例。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)
[English](README.md)

## 📖 简介

**What Claude Update** 是一款零依赖的版本追踪工具。双击 `update.bat`，自动联网获取 Claude Code 从诞生至今所有版本的更新日志，生成精美 HTML 网页——每个功能都配有**中文说明、使用指南和实操示例**，让你再也不错过任何新功能。

## ✨ 核心特性

| 特性 | 说明 |
|------|------|
| 🔄 **一键更新** | 双击 `update.bat`，自动获取最新版本数据并打开浏览器 |
| 📦 **增量同步** | 已缓存的版本永久保留，每次只获取新增版本，秒级完成 |
| 🌐 **中英双语** | 一键切换中文/英文模式，中文含原创使用指南，英文保留原始 release notes |
| 🃏 **功能卡片** | 每个功能独立卡片，按分类分组（插件系统、Agent、CLI命令、工作树……） |
| 💡 **使用示例** | 每个功能配有终端命令实操示例，可直接复制使用 |
| 🔍 **智能搜索** | 搜索版本号或功能名，实时过滤；支持 v0.x / v1.x / v2.x 主版本筛选 |
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

# 2. 双击运行
update.bat

# 或命令行运行
node generate.js
```

首次运行约需 15 秒（获取 409 个版本 + 112 个 release notes），之后每次运行仅需 3 秒（增量检查）。

## 📊 数据来源

| 来源 | 用途 | 更新频率 |
|------|------|----------|
| [npm registry](https://www.npmjs.com/package/@anthropic-ai/claude-code) | 409 个版本号 + 发布日期 | 每次运行 |
| [GitHub Releases](https://github.com/anthropics/claude-code/releases) | 112 个版本的详细更新日志 | 有新版本时 |
| 本地 `kb.json` | 53+ 条功能的中文说明和使用示例 | 手动扩充 |

## 🔧 知识库贡献

按以下格式在 `data/kb.json` 中新增条目即可，下次运行自动生效。关键是填写准确的 `enKeywords`（英文关键词），用于匹配 GitHub release notes 中的原始英文内容。

```json
{
  "plugin-dependency": {
    "titleZh": "插件依赖管理",
    "introducedIn": "2.1.143",
    "category": "插件系统",
    "changeType": "新增",
    "enKeywords": ["plugin dependency", "plugin disable", "transitive dependencies"],
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
