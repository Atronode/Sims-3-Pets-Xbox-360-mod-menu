@echo off
title The Sims 3 Pets - Mod Menu
where pwsh >nul 2>nul
if %errorlevel%==0 (
  pwsh -NoProfile -ExecutionPolicy Bypass -File "%~dp0Sims3ModLoader.ps1"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Sims3ModLoader.ps1"
)
