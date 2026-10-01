<#
.SYNOPSIS
  TraceFlow pilot one-command setup + run for Windows (PowerShell 5.1 and 7+).
.DESCRIPTION
  Automates what the Linux README does with bash, translated to Windows:
    1. Detects OS / CPU architecture (x64 vs ARM64).
    2. Checks prerequisites (Git, Python 3.11+, Docker Desktop) and installs
       whatever is missing via winget (or prints the manual link).
    3. Creates .env from .env.example if missing and ensures DB_APP_PASSWORD
       is set (generates a random local-only one if still placeholder).
    4. Frees the pilot port (default 8000): finds the listening process and
       stops it (skips System/PID 4).
    5. Starts the pilot with `docker compose up --build` (preferred), or with
       a local venv + uvicorn when Docker is unavailable (-NoDocker).
    6. Polls /health and /ready, then opens the pilot in the browser
       (Swagger UI at /docs — this repo is API-only, there is no frontend).
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\pilot-windows.ps1
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\pilot-windows.ps1 -Port 8001 -NoBrowser
#>
[CmdletBinding()]
param(
  [int]$Port = 0,          # 0 = read PORT from .env, fallback 8000
  [switch]$NoDocker,       # skip Docker, run uvicorn directly in a venv
  [switch]$NoBrowser,      # do not auto-open the browser
  [switch]$Rebuild         # force `docker compose build` even when images exist
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RepoRoot

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg)  { Write-Host "  [!!] $msg" -ForegroundColor Yellow }
function Write-Fail($msg)  { Write-Host "  [XX] $msg" -ForegroundColor Red }

# ---------------------------------------------------------------- 0. OS/arch
Write-Step 'Detecting Windows version / architecture'
$arch = $env:PROCESSOR_ARCHITECTURE  # AMD64, ARM64, x86
try {
  $cpu = (Get-CimInstance Win32_Processor | Select-Object -First 1).Name
  Write-Host "  OS: $([Environment]::OSVersion.VersionString) | CPU: $arch | $cpu"
} catch {
  Write-Host "  CPU arch: $arch"
}
if ($arch -eq 'x86' -and [Environment]::Is64BitOperatingSystem) { $arch = 'AMD64' }
$IsArm = ($arch -match 'ARM64')
if ($IsArm) { Write-Warn 'ARM64 detected: use ARM64 installers (winget picks them automatically). Docker Desktop + postgres:16-alpine both support ARM64.' }

# ---------------------------------------------------------------- 1. Prereqs
function Test-Cmd($name) { $null -ne (Get-Command $name -ErrorAction SilentlyContinue) }

function Install-WithWinget($wingetId, $label) {
  if (-not (Test-Cmd 'winget')) {
    Write-Fail "$label is missing and 'winget' was not found. Install manually: https://aka.ms/getwinget"
    return $false
  }
  Write-Host "  Installing $label via winget ($wingetId) ..."
  winget install --exact --id $wingetId --accept-source-agreements --accept-package-agreements
  # refresh PATH for this session
  $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
  return $true
}

Write-Step 'Checking prerequisites (git, python, docker)'

$needGit = -not (Test-Cmd 'git')
if ($needGit) {
  Write-Warn 'git not found.'
  if (-not (Install-WithWinget 'Git.Git' 'Git')) { throw 'Git is required (clone the repo first). Install from https://git-scm.com/download/win' }
} else { Write-Ok ("git " + (git --version)) }

# Python: prefer the `py` launcher, fall back to `python`
$Py = $null
$PyVer = $null
foreach ($cand in @('py', 'python')) {
  if (Test-Cmd $cand) {
    try {
      $out = if ($cand -eq 'py') { & py -3 --version 2>&1 } else { & python --version 2>&1 }
      if ($out -match 'Python (\d+)\.(\d+)') {
        if ([int]$Matches[1] -ge 3 -and ([int]$Matches[1] -gt 3 -or [int]$Matches[2] -ge 11)) {
          $Py = $cand; $PyVer = $out.Trim(); break
        }
      }
    } catch { }
  }
}
if (-not $Py) {
  Write-Warn 'Python 3.11+ not found.'
  if ((Install-WithWinget 'Python.Python.3.12' 'Python 3.12'))) {
    $Py = 'py'; $PyVer = 'Python (fresh install — restart shell if `py` is not recognised)'
  } else { throw 'Python 3.11+ is required. Install from https://www.python.org/downloads/windows/ (tick "Add python.exe to PATH").' }
} else { Write-Ok $PyVer }

$HaveDocker = (Test-Cmd 'docker')
$ComposeCmd = $null
function Test-NativeOk([scriptblock]$cmd) {
  # Native exe exit codes never throw — check $LASTEXITCODE explicitly.
  & $cmd 2>$null | Out-Null
  return ($LASTEXITCODE -eq 0)
}
if ($HaveDocker -and -not $NoDocker) {
  if (Test-NativeOk { docker compose version }) { $ComposeCmd = 'docker compose' }
  elseif ((Test-Cmd 'docker-compose') -and (Test-NativeOk { docker-compose --version })) { $ComposeCmd = 'docker-compose' }
  if (-not $ComposeCmd) { Write-Warn 'docker found but neither `docker compose` nor `docker-compose` works.'; $HaveDocker = $false }
}
if ($HaveDocker -and $ComposeCmd) {
  Write-Ok ("docker " + (docker --version) + " | compose via '$ComposeCmd'")
  if (Test-NativeOk { docker info }) { Write-Ok 'Docker Desktop engine is running' }
  else {
    Write-Warn 'Docker Desktop is installed but the engine is not running. Starting it ...'
    $dd = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
    if (Test-Path $dd) { Start-Process $dd; Write-Host '  Waiting up to 90s for the Docker engine ...' }
    $tries = 0
    $up = $false
    while ($tries -lt 45 -and -not $up) {
      Start-Sleep -Seconds 2; $tries++
      $up = Test-NativeOk { docker info }
    }
    if ($up) { Write-Ok 'Docker engine is up' }
    else { throw 'Docker engine did not start. Open Docker Desktop manually, wait for it to turn green, then re-run this script.' }
  }
} elseif ($NoDocker) {
  Write-Warn 'Running with -NoDocker: local venv + uvicorn (needs an external Postgres for /ready; /health works without one).'
} else {
  Write-Warn 'Docker not found — will fall back to local venv mode.'
  $choice = Read-Host '  Install Docker Desktop via winget now? [Y/n]'
  if ($choice -eq '' -or $choice -match '^[Yy]') {
    if (Install-WithWinget 'Docker.DockerDesktop' 'Docker Desktop') {
      throw 'Docker Desktop was installed. Reboot if asked, start Docker Desktop, then re-run this script.'
    }
  }
  Write-Warn 'Continuing WITHOUT Docker (venv mode). For the full pilot, install Docker Desktop: https://www.docker.com/products/docker-desktop/'
}

# ---------------------------------------------------------------- 2. .env
Write-Step 'Ensuring .env exists and DB_APP_PASSWORD is set'
if (-not (Test-Path '.env')) {
  if (-not (Test-Path '.env.example')) { throw '.env.example is missing — are you in the repo root?' }
  Copy-Item '.env.example' '.env'
  Write-Ok 'Created .env from .env.example (fill SUPABASE_*/ANTHROPIC keys for full AI features)'
} else { Write-Ok '.env already exists' }

$envText = Get-Content '.env' -Raw
if ($envText -match '(?m)^DB_APP_PASSWORD=(change-me-local-only|change-me|)\s*$') {
  $rand = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
  $envText = $envText -replace '(?m)^DB_APP_PASSWORD=.*$', "DB_APP_PASSWORD=$rand-local"
  Set-Content '.env' $envText -NoNewline
  Write-Ok 'Generated a random local-only DB_APP_PASSWORD'
} else { Write-Ok 'DB_APP_PASSWORD is set' }

# Resolve port: CLI > .env PORT > 8000
if ($Port -eq 0) {
  if ($envText -match '(?m)^PORT=(\d+)\s*$') { $Port = [int]$Matches[1] } else { $Port = 8000 }
}
Write-Ok "Pilot port: $Port"

# ---------------------------------------------------------------- 3. Free port
Write-Step "Checking localhost:$Port (kill stale process if needed)"
function Get-PortOwnerPid($port) {
  # Prefer Get-NetTCPConnection (Win8+/2012+), fall back to netstat parsing.
  try {
    $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop | Select-Object -First 1
    return [int]$c.OwningProcess
  } catch { }
  $lines = netstat -ano | Select-String "LISTENING" | Select-String ":$port\s"
  foreach ($l in $lines) {
    if ($l -match '\s(\d+)\s*$') { return [int]$Matches[1] }
  }
  return $null
}
$ownerPid = Get-PortOwnerPid $Port
if ($ownerPid) {
  try {
    $proc = Get-Process -Id $ownerPid -ErrorAction Stop
    if ($proc.Id -eq 4 -or $proc.ProcessName -eq 'System') {
      Write-Warn "Port $Port is held by System (PID 4) — usually IIS or another service. Stop it manually or pick another PORT in .env."
    } else {
      Write-Warn "Port $Port is in use by '$($proc.ProcessName)' (PID $($proc.Id)). Stopping it ..."
      Stop-Process -Id $proc.Id -Force
      Start-Sleep -Seconds 2
      if (Get-PortOwnerPid $Port) { throw "Could not free port $Port. Kill PID $ownerPid via Task Manager, or set PORT in .env to e.g. 8001." }
      Write-Ok "Freed port $Port (stopped $($proc.ProcessName))"
    }
  } catch [Microsoft.PowerShell.Commands.ProcessCommandException] {
    Write-Ok "Port $Port is free (stale PID $ownerPid already gone)"
  }
} else { Write-Ok "Port $Port is free" }

# ---------------------------------------------------------------- 4+5. Run
function Wait-Healthy($port, $path, $timeoutSec, $label) {
  $url = "http://localhost:$port$path"
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
      if ($r.StatusCode -eq 200) { Write-Ok "$label -> $($r.Content.Trim())"; return $true }
    } catch { }
    Start-Sleep -Seconds 2
  }
  return $false
}

if ($HaveDocker -and $ComposeCmd -and -not $NoDocker) {
  Write-Step 'Starting pilot with Docker (build + migrate + api + worker)'
  if ($Rebuild) { Invoke-Expression "$ComposeCmd build" }
  # `up --build -d` is idempotent: reuses volumes, reapplies migrations via the migrate service
  Invoke-Expression "$ComposeCmd up --build -d"
  Write-Host '  Waiting for /health (up to 120s) ...'
  if (-not (Wait-Healthy $Port '/health' 120 '/health')) {
    Write-Fail "'/health' never came up. Recent logs:"
    Invoke-Expression "$ComposeCmd logs --tail=60 api migrate db"
    throw 'Pilot failed to start — see logs above. Common fix: ensure DB_APP_PASSWORD has no special chars from a manual edit, then re-run.'
  }
  Write-Host '  Waiting for /ready (DB + migrations, up to 60s) ...'
  if (-not (Wait-Healthy $Port '/ready' 60 '/ready')) {
    Write-Warn "'/ready' is not green (DB/migrations still applying or keys missing). API docs still work; check: $ComposeCmd logs migrate"
  }
} else {
  Write-Step 'Starting pilot in local venv mode (no Docker)'
  $venvPy = Join-Path $RepoRoot '.venv\Scripts\python.exe'
  if (-not (Test-Path $venvPy)) {
    Write-Host '  Creating .venv ...'
    if ($Py -eq 'py') { & py -3 -m venv .venv } else { & python -m venv .venv }
  }
  Write-Host '  Installing requirements ...'
  & $venvPy -m pip install --upgrade pip
  & $venvPy -m pip install -r requirements.txt
  # Linux run-local.sh hardcodes a throwaway DB URL; on Windows default to the
  # DATABASE_URL already in .env (Supabase or local Postgres).
  Write-Host "  Launching uvicorn on port $Port (new window, close it to stop) ..."
  $uvArgs = "-m uvicorn app.main:app --host 0.0.0.0 --port $Port"
  Start-Process -FilePath $venvPy -ArgumentList $uvArgs -WorkingDirectory $RepoRoot -WindowStyle Normal
  Write-Host '  Waiting for /health (up to 60s) ...'
  if (-not (Wait-Healthy $Port '/health' 60 '/health')) {
    throw 'uvicorn did not come up. Check the uvicorn window for the traceback (often a missing .env DATABASE_URL).'
  }
}

# ---------------------------------------------------------------- 6. Browser
Write-Step 'Pilot is running'
Write-Host "  API docs (Swagger UI): http://localhost:$Port/docs"
Write-Host "  Health:                http://localhost:$Port/health"
Write-Host "  Readiness:             http://localhost:$Port/ready"
if (-not $NoBrowser) {
  Start-Process "http://localhost:$Port/docs"
  Write-Ok 'Opened the pilot in your default browser'
}
if ($HaveDocker -and $ComposeCmd -and -not $NoDocker) {
  Write-Host "`n  Useful commands: $ComposeCmd logs -f api | $ComposeCmd down  (stop) | $ComposeCmd up --build -d (restart)"
}
Write-Ok 'Done.'
