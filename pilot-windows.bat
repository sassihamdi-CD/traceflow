@echo off
REM TraceFlow pilot — double-click launcher for Windows.
REM Runs pilot-windows.ps1 with Bypass (no permanent policy change).
REM From PowerShell run:  .\pilot-windows.bat
REM From cmd run:         pilot-windows.bat
REM Do NOT run the .ps1 file with cmd, and do NOT paste .bat lines into
REM PowerShell — each file only works with its own interpreter.

setlocal
cd /d "%~dp0"

if not exist "%~dp0pilot-windows.ps1" (
  echo [XX] pilot-windows.ps1 not found next to this .bat. Re-clone the repo.
  pause
  exit /b 1
)

where powershell >nul 2>&1
if %errorlevel%==0 (
  set "PSHOST=powershell"
) else (
  where pwsh >nul 2>&1
  if %errorlevel%==0 (
    set "PSHOST=pwsh"
  ) else (
    echo [XX] No PowerShell found. Install it from https://aka.ms/powershell
    pause
    exit /b 1
  )
)

%PSHOST% -NoProfile -ExecutionPolicy Bypass -File "%~dp0pilot-windows.ps1" %*
set EXITCODE=%ERRORLEVEL%
if not "%EXITCODE%"=="0" (
  echo.
  echo [XX] Setup failed with exit code %EXITCODE%. Read the messages above.
  pause
)
endlocal
