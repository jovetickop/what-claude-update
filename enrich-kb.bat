@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ====================================
echo   Claude Code 知识库扩充工具
echo ====================================
echo.
echo 正在使用 Claude CLI 处理 kb.json 条目...
echo 按 Ctrl+C 停止，重新运行可继续。
echo.

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo 错误：未找到 node，请先安装 Node.js。
    pause
    exit /b 1
)

where claude >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo 错误：未找到 claude，请运行：npm install -g @anthropic-ai/claude-code
    pause
    exit /b 1
)

if not exist "data\kb.json" (
    echo 错误：未找到 data\kb.json，请先运行 update.bat。
    pause
    exit /b 1
)

echo 环境正常。
echo.

node enrich-kb.js

echo.
echo 完成。按任意键退出...
pause >nul
exit /b 0
