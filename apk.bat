@echo off
title MyTime - 打包安卓 APK
setlocal
cd /d "%~dp0"

rem ---- 确保 node 可用 ----
where node >nul 2>nul
if errorlevel 1 set "PATH=%PATH%;C:\Program Files\nodejs;%APPDATA%\npm"
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Node.js，请先安装：https://nodejs.org/
  pause
  exit /b 1
)

rem ---- Java：优先 JAVA_HOME，其次本工具链，再次 Android Studio 自带 JBR ----
if not defined JAVA_HOME (
  if exist "%LOCALAPPDATA%\MyTime\jdk\bin\java.exe" set "JAVA_HOME=%LOCALAPPDATA%\MyTime\jdk"
)
if not defined JAVA_HOME (
  if exist "C:\Program Files\Android\Android Studio\jbr\bin\java.exe" set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
)
if defined JAVA_HOME set "PATH=%JAVA_HOME%\bin;%PATH%"
where java >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Java。请先安装 Android Studio（自带 JDK 与安卓 SDK）：
  echo   https://developer.android.com/studio
  pause
  exit /b 1
)

rem ---- 安卓 SDK：常见默认位置（含本工具链） ----
if not defined ANDROID_HOME (
  if exist "%LOCALAPPDATA%\Android\Sdk\platforms" set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
)

rem ---- 首次运行安装壳工程依赖 ----
if not exist "app\node_modules" (
  echo 首次运行：安装 Capacitor 依赖...
  call npm install --prefix app --no-audit --no-fund
  if errorlevel 1 goto :fail
)

echo 第 1/3 步：构建前端...
call npm --prefix web run build
if errorlevel 1 goto :fail

echo 第 2/3 步：同步到安卓工程...
cd app
call npx cap sync android
if errorlevel 1 goto :fail
cd android

echo 第 3/3 步：Gradle 打包（首次会下载 Gradle 与依赖，可能 10 分钟以上）...
call node scripts\sync-version.mjs
call gradlew.bat assembleDebug
if errorlevel 1 goto :fail
cd ..\..

set /p APK_VER=<.apk-version
copy /y "app\android\app\build\outputs\apk\debug\app-debug.apk" "MyTime-v%APK_VER%.apk" >nul
copy /y "app\android\app\build\outputs\apk\debug\app-debug.apk" "MyTime.apk" >nul
if errorlevel 1 goto :fail
echo.
echo 完成！APK 已输出到项目根目录：MyTime.apk
echo 传到安卓手机直接安装（需允许"安装未知应用"），打开后在设置里填电脑地址与密码即可同步。
pause
exit /b 0

:fail
echo.
echo [错误] 打包失败，请检查上方日志。
pause
exit /b 1
