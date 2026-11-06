@echo off
title MyTime - Release
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 set "PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm"
node scripts\release.mjs %1
