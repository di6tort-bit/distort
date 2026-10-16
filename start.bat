@echo off
chcp 65001 >nul
title DISTORT - Freedom Beyond Borders
cd /d "%~dp0"

echo ============================================
echo    DISTORT  -  One-Click Launcher
echo    Freedom Beyond Borders
echo ============================================
echo.

REM ---- Check Node.js ----
where node >nul 2>nul
if errorlevel 1 (
    echo [X] Node.js is NOT installed!
    echo.
    echo Please install Node.js LTS from: https://nodejs.org/
    echo Then run this file again.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo [OK] Node.js found: %NODE_VER%

REM ---- Create .env if missing ----
if not exist ".env" (
    echo DATABASE_URL="file:./db/custom.db"> .env
    echo [OK] Created .env file
) else (
    echo [OK] .env already exists
)

REM ---- Install dependencies if missing ----
if not exist "node_modules" (
    echo.
    echo [SETUP] First run: installing dependencies...
    echo [SETUP] This may take a few minutes. Please wait...
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo [X] npm install failed!
        echo Check your internet connection and try again.
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed
) else (
    echo [OK] Dependencies already installed
)

REM ---- Setup database ----
if not exist "db\custom.db" (
    echo.
    echo [SETUP] Initializing database...
    call npx prisma db push
    if errorlevel 1 (
        echo [X] Database setup failed!
        pause
        exit /b 1
    )
    call npx prisma generate >nul 2>nul
    echo [OK] Database initialized (30 servers seeded)
) else (
    echo [OK] Database already exists
)

echo.
echo ============================================
echo    DISTORT is starting...
echo    Freedom Beyond Borders
echo ============================================
echo.
echo    URL:  http://localhost:3000
echo.
echo    Your browser will open automatically.
echo.
echo    To STOP the server: close this window
echo    or press Ctrl + C.
echo.
echo ============================================
echo.

REM ---- Open browser after the server boots (background) ----
start "" cmd /c "timeout /t 8 /nobreak >nul && start http://localhost:3000"

REM ---- Start the dev server (foreground) ----
call npm run dev

echo.
echo Server stopped. Press any key to exit.
pause >nul
