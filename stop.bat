@echo off
chcp 65001 >nul
title DISTORT - Stop Server
cd /d "%~dp0"

echo ============================================
echo    Stopping DISTORT server...
echo ============================================
echo.

REM Kill any process using port 3000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo Killing process %%a
    taskkill /F /PID %%a >nul 2>nul
)

echo.
echo [OK] Server stopped.
echo.
pause
