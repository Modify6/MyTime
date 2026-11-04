@echo off
title MyTime - Register Autostart
cd /d "%~dp0"
schtasks /Create /F /TN "MyTimeSyncService" /SC ONLOGON /TR "\"%~dp0autostart-server.bat\""
if errorlevel 1 (
  echo [ERROR] Register failed. Try right-click "Run as administrator" on this script.
  pause
  exit /b 1
)
echo Registered: MyTime sync server will auto-start at logon (minimized, port 3128).
echo To remove it, run uninstall-autostart.bat
pause
