@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ====================================
echo   Claude Code Knowledge Enricher
echo ====================================
echo.
echo Processing kb.json entries with Claude CLI...
echo Press Ctrl+C to stop, rerun to resume.
echo.

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: node not found. Install Node.js first.
    pause
    exit /b 1
)

where claude >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: claude not found. Run: npm install -g @anthropic-ai/claude-code
    pause
    exit /b 1
)

if not exist "data\kb.json" (
    echo ERROR: data\kb.json not found. Run update.bat first.
    pause
    exit /b 1
)

echo Environment OK.
echo.

node enrich-kb.js

echo.
echo Done. Press any key to exit...
pause >nul
exit /b 0
