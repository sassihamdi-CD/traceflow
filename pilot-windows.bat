@echo off
REM TraceFlow pilot launcher. Needs Python 3.9+ (installed automatically via
REM winget if missing). Run from PowerShell/cmd as:  .\pilot-windows.bat
setlocal
cd /d "%~dp0"

REM Auto-update so the launcher can never go stale (never fatal).
where git >nul 2>&1
if %errorlevel%==0 (
  git rev-parse --is-inside-work-tree >nul 2>&1
  if %errorlevel%==0 (
    echo Updating from GitHub...
    git pull --ff-only >nul 2>&1
  )
)

where py >nul 2>&1
if %errorlevel%==0 ( set "PY=py" ) else ( set "PY=python" )
%PY% --version >nul 2>&1
if not %errorlevel%==0 (
  echo Python not found - installing via winget...
  winget install --exact --id Python.Python.3.12 --accept-source-agreements --accept-package-agreements
  set "PY=py"
  %PY% --version >nul 2>&1
  if not %errorlevel%==0 (
    echo [XX] Python install failed. Get it from https://www.python.org/downloads/windows/
    pause
    exit /b 1
  )
)

%PY% "%~dp0pilot-windows.py" %*
set EXITCODE=%ERRORLEVEL%
if not "%EXITCODE%"=="0" (
  echo.
  echo [XX] Setup exited with code %EXITCODE%. Read the messages above.
  echo For a no-change diagnosis, run:  py pilot-windows.py --check
  pause
)
endlocal
