@echo off
chcp 65001 >nul
title ЛЗ 12 и ЛЗ 13: прогон модели
cd /d "%~dp0"

where ollama >nul 2>nul
if errorlevel 1 (
  echo Ollama не установлена. Скачайте с https://ollama.com/download, установите и запустите этот файл снова.
  pause
  exit /b 1
)

echo === 1. Скачиваю модель qwen2.5:3b (около 2 ГБ, только в первый раз) ===
ollama pull qwen2.5:3b
if errorlevel 1 (
  echo Не удалось скачать модель. Проверьте интернет и запустите файл снова.
  pause
  exit /b 1
)
echo Модель готова. Сайт теперь может давать подсказки с ИИ.

set PY=
where py >nul 2>nul
if not errorlevel 1 set PY=py
if not defined PY (
  where python >nul 2>nul
  if not errorlevel 1 set PY=python
)
if not defined PY (
  echo.
  echo Python не найден — замеры ЛЗ 12 и 13 пропущены. Сайт с ИИ работает и без них.
  echo Для замеров установите Python с https://www.python.org/downloads/ ^(отметьте "Add python.exe to PATH"^) и запустите файл снова.
  pause
  exit /b 0
)

echo === 2. ЛЗ 12: правила без ИИ ===
%PY% evals\baseline.py
echo === 3. ЛЗ 12: прогон модели на 44 примерах, два подхода (несколько минут) ===
%PY% evals\run_llm.py
if errorlevel 1 (
  pause
  exit /b 1
)
%PY% evals\report.py

echo === 4. ЛЗ 13: статус-отчёты за два последних спринта ===
%PY% scripts\weekly_status.py --sprints 2

echo.
echo Готово. Результаты: evals\results.md и папка reports.
echo Дальше: запустите start.bat, войдите как admin@khvost.local / Admin12345,
echo Управление - "ИИ-подсказки" - "Есеп ЗЖ 12 (қаз., PDF)" - "Басып шығару / PDF сақтау".
echo Так же для ЛЗ 13: Управление - "PM-ассистент" - "Есеп ЗЖ 13 (қаз., PDF)".
pause
