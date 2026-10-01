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
    6. Polls /health, /ready and the web console, then opens the pilot
       console (frontend) in the browser (API docs at /docs).
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\pilot-windows.ps1
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\pilot-windows.ps1 -Port 8001 -NoBrowser
.EXAMPLE
  # Import a .env received privately (real keys are NEVER in git):
  .\pilot-windows.bat -EnvFile "$env:USERPROFILE\Downloads\.env"
#>
[CmdletBinding()]
param(
  [int]$Port = 0,          # 0 = read PORT from .env, fallback 8000
  [switch]$NoDocker,       # skip Docker, run uvicorn directly in a venv
  [switch]$NoBrowser,      # do not auto-open the browser
  [switch]$Rebuild,        # force `docker compose build` even when images exist
  [string]$EnvFile = ''    # path to a privately-received .env to import (see README "Real keys")
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
$arch = $env:PROCESSOR_ARCHITECTURE  # AMD64, ARM64, x86 (Windows); empty elsewhere
if ([string]::IsNullOrWhiteSpace($arch)) {
  try { $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString() } catch { $arch = 'unknown' }
}
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

# Python: prefer the `py` launcher, fall back to `python` / `python3`
$Py = $null
$PyVer = $null
foreach ($cand in @('py', 'python', 'python3')) {
  if (Test-Cmd $cand) {
    try {
      $out = if ($cand -eq 'py') { & py -3 --version 2>&1 } else { & $cand --version 2>&1 }
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
  if ((Install-WithWinget 'Python.Python.3.12' 'Python 3.12')) {
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
if ($EnvFile -ne '') {
  if (-not (Test-Path $EnvFile)) { throw "EnvFile not found: $EnvFile" }
  Copy-Item $EnvFile '.env' -Force
  Write-Ok "Imported private env file -> .env ($EnvFile). Never commit this file."
} elseif (-not (Test-Path '.env')) {
  if (-not (Test-Path '.env.example')) { throw '.env.example is missing — are you in the repo root?' }
  Copy-Item '.env.example' '.env'
  Write-Ok 'Created .env from .env.example (placeholders — see README "Real keys" for full features)'
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

# ---- Bridge backend keys -> frontend build args (docker bakes NEXT_PUBLIC_* at build) ----
function Test-IsPlaceholder($v) {
  if ([string]::IsNullOrWhiteSpace($v)) { return $true }
  foreach ($ph in @('change-me', 'xyz', '<account', 'sk-ant-change-me', 'example')) {
    if ($v -like "*$ph*") { return $true }
  }
  return $false
}
function Set-EnvLine($name, $value) {
  if ($script:envText -match "(?m)^$name=.*$") { $script:envText = $script:envText -replace "(?m)^$name=.*$", "$name=$value" }
  else {
    if (-not $script:envText.EndsWith("`n")) { $script:envText += "`n" }
    $script:envText += "$name=$value`n"
  }
}
$supaUrl = ''; $supaAnon = ''; $nxUrl = ''; $nxAnon = ''; $nxApi = ''
if ($envText -match '(?m)^SUPABASE_URL=(.*)\s*$') { $supaUrl = $Matches[1].Trim() }
if ($envText -match '(?m)^SUPABASE_ANON_KEY=(.*)\s*$') { $supaAnon = $Matches[1].Trim() }
if ($envText -match '(?m)^NEXT_PUBLIC_SUPABASE_URL=(.*)\s*$') { $nxUrl = $Matches[1].Trim() }
if ($envText -match '(?m)^NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)\s*$') { $nxAnon = $Matches[1].Trim() }
if ($envText -match '(?m)^NEXT_PUBLIC_API_URL=(.*)\s*$') { $nxApi = $Matches[1].Trim() }
$patched = $false
if ((Test-IsPlaceholder $nxUrl) -and (-not (Test-IsPlaceholder $supaUrl))) { Set-EnvLine 'NEXT_PUBLIC_SUPABASE_URL' $supaUrl; $patched = $true }
if ((Test-IsPlaceholder $nxAnon) -and (-not (Test-IsPlaceholder $supaAnon))) { Set-EnvLine 'NEXT_PUBLIC_SUPABASE_ANON_KEY' $supaAnon; $patched = $true }
if ([string]::IsNullOrWhiteSpace($nxApi)) { Set-EnvLine 'NEXT_PUBLIC_API_URL' "http://localhost:$Port"; $patched = $true }
elseif (($nxApi -eq 'http://localhost:8000') -and ($Port -ne 8000)) { Set-EnvLine 'NEXT_PUBLIC_API_URL' "http://localhost:$Port"; $patched = $true }
if ($patched) {
  Set-Content '.env' $script:envText -NoNewline
  Write-Ok 'Bridged backend keys -> frontend build args in .env'
}

# Web console port: .env WEB_PORT, fallback 3000 (compose maps it to container :3000).
$WebPort = 3000
if ($envText -match '(?m)^WEB_PORT=(\d+)\s*$') { $WebPort = [int]$Matches[1] }
Write-Ok "Web console port: $WebPort"

# ---- Key check: which integrations are live vs placeholder ----
$envMap = @{}
foreach ($line in (Get-Content '.env')) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') { $envMap[$Matches[1]] = $Matches[2].Trim() }
}
function Test-RealKey($name) {
  return (-not (Test-IsPlaceholder $envMap[$name]))
}
Write-Host '  Key status (placeholder = feature disabled, pilot still runs):'
$keyGroups = @(
  @('SUPABASE_URL', 'SUPABASE_ANON_KEY', 'login-gated routes'),
  @('ANTHROPIC_API_KEY', $null, 'AI extraction'),
  @('R2_ENDPOINT', 'R2_ACCESS_KEY_ID', 'file uploads (R2)'),
  @('NEXT_PUBLIC_PILOT_INVITE_CODE', $null, 'pilot invite gate (web)')
)
foreach ($g in $keyGroups) {
  $names = @($g[0], $g[1]) | Where-Object { $_ }
  $ok = $true; foreach ($n in $names) { if (-not (Test-RealKey $n)) { $ok = $false } }
  if ($ok) { Write-Ok "$($g[2]): keys look REAL" }
  else { Write-Warn "$($g[2]): placeholder keys — disabled until you import a real .env (README 'Real keys')" }
}

# ---------------------------------------------------------------- 3. Free ports
Write-Step 'Checking localhost ports (kill stale processes if needed)'
function Free-Port($port, $label) {
  $ownerPid = Get-PortOwnerPid $port
  if (-not $ownerPid) { Write-Ok "$label port $port is free"; return }
  try {
    $proc = Get-Process -Id $ownerPid -ErrorAction Stop
    if ($proc.Id -eq 4 -or $proc.ProcessName -eq 'System') {
      Write-Warn "$label port $port is held by System (PID 4) — stop it manually or set another port in .env."
    } else {
      Write-Warn "$label port $port is in use by '$($proc.ProcessName)' (PID $($proc.Id)). Stopping it ..."
      Stop-Process -Id $proc.Id -Force
      Start-Sleep -Seconds 2
      if (Get-PortOwnerPid $port) { throw "Could not free $label port $port. Kill PID $ownerPid via Task Manager, or set another port in .env." }
      Write-Ok "Freed $label port $port (stopped $($proc.ProcessName))"
    }
  } catch [Microsoft.PowerShell.Commands.ProcessCommandException] {
    Write-Ok "$label port $port is free (stale PID $ownerPid already gone)"
  }
}
Free-Port $Port 'API'
Free-Port $WebPort 'web console'
function Get-PortOwnerPid($port) {
  # Prefer Get-NetTCPConnection (Win8+/2012+), fall back to netstat parsing.
  try {
    $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop | Select-Object -First 1
    return [int]$c.OwningProcess
  } catch { }
  try {
    $lines = netstat -ano 2>$null | Select-String "LISTENING" | Select-String ":$port\s"
    foreach ($l in $lines) {
      if ($l -match '\s(\d+)\s*$') { return [int]$Matches[1] }
    }
  } catch { }
  return $null
}

# ---------------------------------------------------------------- 4+5. Run
function Wait-Healthy($port, $path, $timeoutSec, $label) {
  $url = "http://localhost:$port$path"
  $deadline = (Get-Date).AddSeconds($timeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
      if ($r.StatusCode -lt 400) { Write-Ok "$label -> HTTP $([int]$r.StatusCode)"; return $true }
    } catch { }
    Start-Sleep -Seconds 2
  }
  return $false
}

if ($HaveDocker -and $ComposeCmd -and -not $NoDocker) {
  Write-Step 'Starting pilot with Docker (build + migrate + api + worker + web)'
  if ($Rebuild) { Invoke-Expression "$ComposeCmd build" }
  # `up --build -d` is idempotent: reuses volumes, reapplies migrations via the migrate service
  Invoke-Expression "$ComposeCmd up --build -d"
  Write-Host '  Waiting for /health (up to 120s) ...'
  if (-not (Wait-Healthy $Port '/health' 120 'API /health')) {
    Write-Fail "'/health' never came up. Recent logs:"
    Invoke-Expression "$ComposeCmd logs --tail=60 api migrate db"
    throw 'Pilot failed to start — see logs above. Common fix: ensure DB_APP_PASSWORD has no special chars from a manual edit, then re-run.'
  }
  Write-Host '  Waiting for /ready (DB + migrations, up to 60s) ...'
  if (-not (Wait-Healthy $Port '/ready' 60 'API /ready')) {
    Write-Warn "'/ready' is not green (DB/migrations still applying or keys missing). Console may still work; check: $ComposeCmd logs migrate"
  }
  Write-Host '  Waiting for web console (up to 180s — first `npm run build` takes a while) ...'
  if (-not (Wait-Healthy $WebPort '/' 180 'web console')) {
    Write-Fail "'web console' never came up. Recent logs:"
    Invoke-Expression "$ComposeCmd logs --tail=60 web"
    throw 'Web console failed to start — see logs above.'
  }
} else {
  Write-Step 'Starting pilot in local venv mode (no Docker)'
  if ($env:OS -eq 'Windows_NT') { $venvPy = Join-Path $RepoRoot '.venv\Scripts\python.exe' }
  else { $venvPy = Join-Path $RepoRoot '.venv/bin/python' }
  if (-not (Test-Path $venvPy)) {
    Write-Host '  Creating .venv ...'
    if ($Py -eq 'py') { & py -3 -m venv .venv }
    elseif ($Py -eq 'python3') { & python3 -m venv .venv }
    else { & python -m venv .venv }
  }
  Write-Host '  Installing requirements ...'
  & $venvPy -m pip install --upgrade pip
  & $venvPy -m pip install -r requirements.txt
  # Linux run-local.sh hardcodes a throwaway DB URL; on Windows default to the
  # DATABASE_URL already in .env (Supabase or local Postgres).
  Write-Host "  Launching uvicorn on port $Port (new window, close it to stop) ..."
  $uvArgs = "-m uvicorn app.main:app --host 0.0.0.0 --port $Port"
  # -WindowStyle exists only on Windows; $env:OS is 'Windows_NT' there (5.1-safe check).
  if ($env:OS -eq 'Windows_NT') { Start-Process -FilePath $venvPy -ArgumentList $uvArgs -WorkingDirectory $RepoRoot -WindowStyle Normal }
  else { Start-Process -FilePath $venvPy -ArgumentList $uvArgs -WorkingDirectory $RepoRoot }
  Write-Host '  Waiting for /health (up to 60s) ...'
  if (-not (Wait-Healthy $Port '/health' 60 'API /health')) {
    throw 'uvicorn did not come up. Check the uvicorn window for the traceback (often a missing .env DATABASE_URL).'
  }
  Write-Warn 'venv mode starts the API only. For the web console: cd web; npm ci; npm run dev  (needs Node 20+)'
}

# ---------------------------------------------------------------- 6. Browser
Write-Step 'Pilot is running'
$WebUrl = "http://localhost:$WebPort"
Write-Host "  Pilot console (frontend): $WebUrl"
Write-Host "  API docs (Swagger UI):  http://localhost:$Port/docs"
Write-Host "  Health:                 http://localhost:$Port/health"
Write-Host "  Readiness:              http://localhost:$Port/ready"
if (-not $NoBrowser) {
  Start-Process $WebUrl
  Write-Ok 'Opened the pilot console in your default browser'
}
if ($HaveDocker -and $ComposeCmd -and -not $NoDocker) {
  Write-Host "`n  Useful commands: $ComposeCmd logs -f api | $ComposeCmd down  (stop) | $ComposeCmd up --build -d (restart)"
}
Write-Ok 'Done.'
