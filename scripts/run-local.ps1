<#
.SYNOPSIS
  Local run (no Docker): API against the throwaway docker DB, Windows edition.
.DESCRIPTION
  PowerShell equivalent of scripts/run-local.sh.
  Usage: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-local.ps1
  Then open http://localhost:8000/docs
#>
$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RepoRoot

$venvPy = Join-Path $RepoRoot '.venv\Scripts\python.exe'
if (-not (Test-Path $venvPy)) {
  throw "No venv found at .venv. Create it first: py -3 -m venv .venv; .\.venv\Scripts\Activate.ps1; pip install -r requirements.txt"
}

$env:DATABASE_URL = 'postgresql://traceflow_app:tracflow-local-test@localhost:5434/traceflow'
& $venvPy -m uvicorn app.main:app --host 0.0.0.0 --port 8000
