@echo off
setlocal
call "%~dp0start-online-instance.cmd" A
if errorlevel 1 (
  echo.
  echo [ERROR] Failed to start online instance A.
  pause
)
endlocal
