@echo off
title MyTime - Android APK Builder
rem Thin ASCII wrapper: all logic lives in scripts\apk.mjs (avoids GBK bat pitfalls entirely)
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found. Install Node 22+ from https://nodejs.org/
  pause
  exit /b 1
)
node scripts\apk.mjs
echo.
pause
