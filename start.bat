@echo off
chcp 65001 >nul
title Доктор Хвост
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js не установлен. Скачайте его с https://nodejs.org и запустите этот файл снова.
  pause
  exit /b 1
)
echo Запускаю сайт... Не закрывайте это окно, пока пользуетесь сайтом.
start "" cmd /c "timeout /t 3 >nul & start http://127.0.0.1:8000"
node src\server.js
echo.
echo Сайт остановлен.
pause
