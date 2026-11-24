@echo off
chcp 65001 >nul
title ЛЗ 12 и ЛЗ 13: прогон модели
cd /d "%~dp0"

set PY=
where py >/dev/null 2>/dev/null && set PY=py
if not defined PY where python >/dev/null 2>/dev/null && set PY=python
if not defined PY (
  echo Python не найден. Установите с https://www.python.org/downloads/ и отметьте "Add python.exe to PATH".
  pause & exit /b 1
)
where ollama >/dev/null 2>nul
if errorlevel 1 (
  echo Ollama не установлена. Скачайте с https://ollama.com/download, установите и запустите этот файл снова.
  pause & exit /b 1
)

echo === 1. Скачиваю модель qwen2.5:3b (около 2 ГБ, только в первый раз) ===
ollama pull qwen2.5:3b || (echo Не удалось скачать модель & pause & exit /b 1)

echo === 2. ЛЗ 12: правила без ИИ ===
%PY% evals\baseline.py
echo === 3. ЛЗ 12: прогон модели на 44 примерах, два подхода (несколько минут) ===
%PY% evals\run_llm.py || (pause & exit /b 1)
%PY% evals\report.py

echo === 4. ЛЗ 13: статус-отчёты за два последних спринта ===
%PY% scripts\weekly_status.py --sprints 2

echo.
echo Готово. Результаты: evals\results.md и папка reports.
echo Дальше: запустите start.bat, войдите как admin@khvost.local / Admin12345,
echo откройте Управление - "ИИ-подсказки" - "Отчёт ЛЗ 12 (PDF)" и нажмите "Печать" - "Сохранить как PDF".
echo Так же для ЛЗ 13: Управление - "PM-ассистент" - "Отчёт ЛЗ 13 (PDF)".
pause
