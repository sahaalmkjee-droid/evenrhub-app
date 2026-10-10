@echo off
title EventHub Public Tunnel
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_tunnel.ps1"
pause
