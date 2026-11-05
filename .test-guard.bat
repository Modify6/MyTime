@echo off
netstat -ano > "%~dp0.net-raw.txt" 2>&1
findstr ":3128" "%~dp0.net-raw.txt" > "%~dp0.net-hit.txt"
echo errlevel=%errorlevel% >> "%~dp0.net-hit.txt"
