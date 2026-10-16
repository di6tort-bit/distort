@echo off
chcp 65001 >nul
title DISTORT - Desktop Preview
cd /d "%~dp0"

echo ============================================
echo    DISTORT - Windows Desktop Preview
echo    NOT A WORKING VPN YET
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js 20.11+ is required.
  echo Install the LTS version from https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [SETUP] Installing project dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] Dependency installation failed.
    pause
    exit /b 1
  )
)

echo [INFO] Starting DISTORT desktop preview...
call npm start
if errorlevel 1 (
  echo [ERROR] DISTORT could not start. Review the output above.
  pause
  exit /b 1
)
