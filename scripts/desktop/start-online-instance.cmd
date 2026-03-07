@echo off
setlocal EnableExtensions

set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%..\.."
for %%I in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fI"
set "PROFILE=%~1"
if "%PROFILE%"=="" set "PROFILE=A"

set "LOCAL_ENV_FILE=%SCRIPT_DIR%local-online-env.cmd"
if not exist "%LOCAL_ENV_FILE%" (
  echo [ERROR] Missing local env file: %LOCAL_ENV_FILE%
  echo Copy scripts\desktop\local-online-env.example.cmd to local-online-env.cmd and fill keys.
  exit /b 1
)

call "%LOCAL_ENV_FILE%"
if errorlevel 1 exit /b 1

if "%SUPABASE_URL%"=="" (
  echo [ERROR] SUPABASE_URL is empty in local-online-env.cmd
  exit /b 1
)

if "%SUPABASE_ANON_KEY%"=="" (
  echo [ERROR] SUPABASE_ANON_KEY is empty in local-online-env.cmd
  exit /b 1
)

if "%SUPABASE_DUEL_FUNCTION%"=="" (
  set "SUPABASE_DUEL_FUNCTION=duel-online"
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm is not found in PATH.
  echo Install Node.js and ensure npm command is available.
  exit /b 1
)

if "%LOCALAPPDATA%"=="" (
  set "BASE_PROFILE_DIR=%ROOT_DIR%\profiles"
) else (
  set "BASE_PROFILE_DIR=%LOCALAPPDATA%\DesktopPetProfiles"
)

set "PET_USER_DATA_DIR=%BASE_PROFILE_DIR%\%PROFILE%\userData"
set "PET_RUNTIME_DATA_FILE=%BASE_PROFILE_DIR%\shared\pet-runtime-data.json"
if not exist "%PET_USER_DATA_DIR%" (
  mkdir "%PET_USER_DATA_DIR%" >nul 2>nul
)
set "PET_SESSION_DATA_FILE=%PET_USER_DATA_DIR%\pet-auth-session.json"
if /I not "%PET_KEEP_AUTH_SESSION%"=="1" (
  if exist "%PET_SESSION_DATA_FILE%" (
    del /f /q "%PET_SESSION_DATA_FILE%" >nul 2>nul
  )
)
for %%I in ("%PET_RUNTIME_DATA_FILE%") do set "PET_RUNTIME_DATA_DIR=%%~dpI"
if not exist "%PET_RUNTIME_DATA_DIR%" (
  mkdir "%PET_RUNTIME_DATA_DIR%" >nul 2>nul
)

echo [INFO] Profile=%PROFILE%
echo [INFO] SUPABASE_URL=%SUPABASE_URL%
echo [INFO] PET_USER_DATA_DIR=%PET_USER_DATA_DIR%
echo [INFO] PET_RUNTIME_DATA_FILE=%PET_RUNTIME_DATA_FILE%
echo [INFO] PET_SESSION_DATA_FILE=%PET_SESSION_DATA_FILE%
if /I not "%PET_KEEP_AUTH_SESSION%"=="1" (
  echo [INFO] Auto-clear auth session enabled. Set PET_KEEP_AUTH_SESSION=1 to keep login state.
)

cd /d "%ROOT_DIR%"
call npm run dev:pc

endlocal
