@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ═══════════════════════════════════
echo   Claude Code 版本追踪工具
echo ═══════════════════════════════════
echo.
echo 正在获取最新版本数据并生成 HTML...
echo 请耐心等待，首次运行可能需要一些时间...
echo.

node generate.js

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ❌ 生成失败，请检查错误信息。
    echo 按任意键退出...
    pause >nul
    exit /b %ERRORLEVEL%
)

echo.
echo 正在打开浏览器...
start "" "%~dp0claude-versions.html"

exit /b 0
