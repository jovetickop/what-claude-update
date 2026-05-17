@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ====================================
echo   Claude Code 版本更新工具
echo ====================================
echo.
echo 正在检查新版本...
echo.

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo 错误：未找到 node，请先安装 Node.js。
    pause
    exit /b 1
)

echo 环境正常，开始更新...
echo.

node generate.js

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo 生成失败，请检查上方错误信息。
    echo 按任意键退出...
    pause >nul
    exit /b %ERRORLEVEL%
)

echo.
echo 完成！正在打开浏览器...
start "" "%~dp0claude-versions.html"

exit /b 0
