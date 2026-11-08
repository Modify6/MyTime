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

rem ---- 工具链定位：优先工作文件夹 toolchain（随整个 zi 目录迁移携带），其次本机标准位置 ----
set "TC_JDK="
set "TC_SDK="
if exist "%~dp0..\toolchain\jdk\bin\java.exe" set "TC_JDK=%~dp0..\toolchain\jdk"
if not defined TC_JDK if exist "%LOCALAPPDATA%\MyTime\jdk\bin\java.exe" set "TC_JDK=%LOCALAPPDATA%\MyTime\jdk"
if exist "%~dp0..\toolchain\android-sdk\platforms\android-35" set "TC_SDK=%~dp0..\toolchain\android-sdk"
if not defined TC_SDK if exist "%LOCALAPPDATA%\Android\Sdk\platforms\android-35" set "TC_SDK=%LOCALAPPDATA%\Android\Sdk"

rem ---- 自举：两处都没有 → 自动下载安装进工作文件夹 toolchain（一次性，之后随迁移携带） ----
if not defined TC_JDK (
  echo [工具链] 未检测到 JDK，自动下载安装（清华镜像，约 200MB，一次性）...
  call node scripts\setup-toolchain.mjs jdk
  if errorlevel 1 goto :fail
  set "TC_JDK=%~dp0..\toolchain\jdk"
)
if not defined TC_SDK (
  echo [工具链] 未检测到 Android SDK，自动下载安装（约 600MB，一次性）...
  call node scripts\setup-toolchain.mjs android-sdk
  if errorlevel 1 goto :fail
  set "TC_SDK=%~dp0..\toolchain\android-sdk"
)

rem ---- 环境注入：Java / Android SDK / Gradle 缓存全部收在工作文件夹内 ----
for %%I in ("%~dp0..\toolchain") do set "TOOLCHAIN_DIR=%%~fI"
set "JAVA_HOME=%TC_JDK%"
set "PATH=%TC_JDK%\bin;%PATH%"
set "ANDROID_HOME=%TC_SDK%"
set "GRADLE_USER_HOME=%TOOLCHAIN_DIR%\gradle-home"
echo [工具链] JDK=%TC_JDK%
echo [工具链] SDK=%TC_SDK%
echo [工具链] Gradle缓存=%GRADLE_USER_HOME%

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

echo 第 3/3 步：Gradle 打包（首次会下载 Gradle 与依赖到 toolchain\gradle-home，可能 10 分钟以上）...
call node ..\..\scripts\sync-version.mjs
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
