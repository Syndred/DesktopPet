@echo off
setlocal
node "%~dp0start-online-instance.cjs" "%~1"
set "LAUNCH_EXIT_CODE=%ERRORLEVEL%"
endlocal & exit /b %LAUNCH_EXIT_CODE%
