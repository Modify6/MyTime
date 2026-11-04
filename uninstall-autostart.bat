@echo off
title MyTime - Unregister Autostart
schtasks /Delete /TN "MyTimeSyncService" /F
echo Autostart removed.
pause
