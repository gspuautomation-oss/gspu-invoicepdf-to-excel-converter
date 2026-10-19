@echo off
cd /d "%~dp0"
title GSPU Invoice PDF to Excel Converter
echo ========================================================
echo   GSPU Management Consulting - PDF to Excel Converter
echo ========================================================
echo Working folder: %CD%
echo.

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed on this computer.
    echo Please download and install Node.js LTS from: https://nodejs.org/
    echo After installing Node.js, double-click START_APP.bat again.
    pause
    exit /b 1
)

set HOST=127.0.0.1
set PORT=3000

if not exist "node_modules\.bin\tsx.cmd" (
    echo [1/2] First-time setup: Installing required packages...
    call npm install --legacy-peer-deps
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Package installation failed. Please check your internet connection and try again.
        pause
        exit /b 1
    )
)

echo [2/2] Starting local server on http://localhost:3000 ...
start /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"
call npm start
pause
