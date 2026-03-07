@echo off
setlocal
call "%~dp0start-online-instance.cmd" B
if errorlevel 1 (
  echo.
  echo [ERROR] Failed to start online instance B.
  pause
)
endlocal
