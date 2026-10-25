@echo off
title Plastic Flow Lab
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed.
  echo  Install the "LTS" version from https://nodejs.org , then double-click this file again.
  echo.
  start "" https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo  First run: installing the app's parts. This takes a minute or two...
  call npm install
  if errorlevel 1 (
    echo  Install failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)

echo.
echo  Starting Plastic Flow Lab...
echo  Your browser will open at http://localhost:8787
echo.
echo  To open it on a phone or tablet on the same Wi-Fi, use one of these addresses (add :8787):
ipconfig | findstr /c:"IPv4"
echo.
echo  Keep this window open while you use the app. Close it to stop the app.
echo.

start "" cmd /c "timeout /t 8 >nul & start http://localhost:8787"
call npm start
pause
