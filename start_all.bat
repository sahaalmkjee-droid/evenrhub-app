@echo off
title EventHub Master Launcher
echo ========================================================
echo   Launching Smart Event Hub (Backend, Frontend, Tunnel)
echo ========================================================
echo.

echo [0/3] Starting Local SLM (Ollama on GPU)...
start "Ollama Local SLM" /min cmd /c ""%LOCALAPPDATA%\Programs\Ollama\ollama.exe" serve"

timeout /t 2 /nobreak >nul

echo [1/3] Starting Backend (FastAPI on http://localhost:8000)...
start "EventHub Backend" cmd /k "cd /d %~dp0backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 2 /nobreak >nul

echo [2/3] Starting Frontend (Vite on http://localhost:3000)...
start "EventHub Frontend" cmd /k "cd /d %~dp0frontend && npm run dev -- --host 0.0.0.0 --port 3000"

timeout /t 3 /nobreak >nul

echo [3/3] Starting Public Cloudflare Tunnel...
start "EventHub Public Tunnel" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_tunnel.ps1"

echo.
echo All 3 services launched!
echo Check the "EventHub Public Tunnel" window for your public link!
echo.
pause
