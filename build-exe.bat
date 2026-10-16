@echo off
chcp 65001 >nul
title DISTORT - Build Windows Desktop App (.exe)
cd /d "%~dp0"

echo ============================================
echo    DISTORT  -  Desktop App Builder
echo    Building Windows .exe (portable)
echo ============================================
echo.

REM ---- Check Node.js ----
where node >nul 2>nul
if errorlevel 1 (
    echo [X] Node.js is NOT installed! Install from https://nodejs.org/
    pause
    exit /b 1
)
echo [OK] Node.js found

REM ---- Create .env if missing ----
if not exist ".env" (
    echo DATABASE_URL="file:./db/custom.db"> .env
)

REM ---- Install dependencies if missing ----
if not exist "node_modules" (
    echo [SETUP] Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo [X] npm install failed!
        pause
        exit /b 1
    )
)

echo.
echo [1/5] Building Next.js standalone...
call npm run build
if errorlevel 1 goto :error

echo.
echo [2/5] Generating Prisma client...
call npx prisma generate
if errorlevel 1 goto :error

echo.
echo [3/5] Copying schema to standalone...
if not exist ".next\standalone\prisma" mkdir ".next\standalone\prisma"
copy /Y prisma\schema.prisma ".next\standalone\prisma\schema.prisma" >nul

echo.
echo [4/5] Packaging Windows .exe (this takes several minutes)...
call npx electron-builder --win portable --x64 --config.npmRebuild=false
if errorlevel 1 goto :error

echo.
echo ============================================
echo    BUILD COMPLETE!
echo ============================================
echo.
echo    Output location:
echo    release\DISTORT-Portable-1.0.0.exe
echo.
echo    Just double-click that .exe to run
echo    DISTORT as a native desktop app.
echo.
pause
exit /b 0

:error
echo.
echo ============================================
echo    BUILD FAILED
echo ============================================
echo.
echo Check the error messages above.
pause
exit /b 1
