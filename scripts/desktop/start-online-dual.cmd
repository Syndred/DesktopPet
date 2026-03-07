@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
if not exist "%SCRIPT_DIR%start-online-a.cmd" (
  echo [ERROR] Missing script: %SCRIPT_DIR%start-online-a.cmd
  pause
  exit /b 1
)
if not exist "%SCRIPT_DIR%start-online-b.cmd" (
  echo [ERROR] Missing script: %SCRIPT_DIR%start-online-b.cmd
  pause
  exit /b 1
)

start "DesktopPet-A" /D "%SCRIPT_DIR%" cmd /k call "%SCRIPT_DIR%start-online-a.cmd"
start "DesktopPet-B" /D "%SCRIPT_DIR%" cmd /k call "%SCRIPT_DIR%start-online-b.cmd"

endlocal
