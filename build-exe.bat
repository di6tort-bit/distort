@echo off
chcp 65001 >nul
title DISTORT - Build Windows Installer
cd /d "%~dp0"

echo ============================================
echo    DISTORT - Windows Installer Builder
echo    Early preview, not a working VPN
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
  echo [SETUP] Installing dependencies...
  call npm install
  if errorlevel 1 goto :error
)

echo [BUILD] Packaging DISTORT for Windows...
call npm run dist:win
if errorlevel 1 goto :error

echo.
echo [OK] Build command completed. Check the release folder.
echo NOTE: This preview does not provide VPN protection.
pause
exit /b 0

:error
echo.
echo [ERROR] Build failed. Review the messages above.
pause
exit /b 1
