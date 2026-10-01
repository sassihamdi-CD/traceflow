@echo off
REM TraceFlow pilot — double-click launcher for Windows.
REM Runs pilot-windows.ps1 with Bypass (no permanent policy change).
REM Usage: double-click, or: pilot-windows.bat -NoBrowser

setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0pilot-windows.ps1" %*
set EXITCODE=%ERRORLEVEL%
if not "%EXITCODE%"=="0" (
  echo.
  echo [XX] Setup failed with exit code %EXITCODE%. Read the messages above.
  pause
)
endlocal
