@echo off
setlocal
cd /d "%~dp0"
set "frame_node=node"
if exist ".frame-runtime.json" (
  for /f "usebackq delims=" %%N in (`powershell.exe -NoProfile -Command "try { (ConvertFrom-Json -InputObject ([System.IO.File]::ReadAllText((Join-Path (Get-Location) '.frame-runtime.json')))).nodePath } catch { exit 1 }"`) do set "frame_node=%%N"
)
"%frame_node%" scripts/launch.js
if errorlevel 1 (
  pause
  exit /b 1
)
