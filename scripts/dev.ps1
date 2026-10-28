<#
.SYNOPSIS
  Starts the MailPilot AI development stack on Windows: local Supabase, API, worker and frontend.
  Each service opens in its own PowerShell window so logs stay visible. Close a window to stop it.

.EXAMPLE
  .\scripts\dev.ps1               # everything
  .\scripts\dev.ps1 -NoSupabase   # when using a hosted Supabase project
  .\scripts\dev.ps1 -Storybook    # also start Storybook on :6006
#>
param([switch]$NoSupabase, [switch]$Storybook)
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$py = Join-Path $root "backend\.venv\Scripts\python.exe"
if (-not (Test-Path $py)) { throw "Backend venv missing. Run: cd backend; py -3.14 -m venv .venv; .venv\Scripts\python.exe -m pip install -r requirements-dev.txt" }
if (-not (Test-Path (Join-Path $root "backend\.env"))) { throw "backend\.env missing. Copy backend\.env.example and fill it in." }
if (-not (Test-Path (Join-Path $root "frontend\.env.local"))) { throw "frontend\.env.local missing. Copy frontend\.env.example and fill it in." }

if (-not $NoSupabase) {
  Write-Host "Starting local Supabase (Docker Desktop must be running)..."
  Push-Location $root
  npx supabase@2.122.0 start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,postgres-meta
  Pop-Location
}

function Start-Window($title, $dir, $command) {
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle='$title'; Set-Location '$dir'; $command"
}
Start-Window "MailPilot API" (Join-Path $root "backend") "& '$py' -m uvicorn app.main:app --reload --port 8000"
Start-Window "MailPilot worker" (Join-Path $root "backend") "& '$py' -m app.jobs.worker"
Start-Window "MailPilot frontend" (Join-Path $root "frontend") "npm run dev"
if ($Storybook) { Start-Window "MailPilot Storybook" (Join-Path $root "frontend") "npm run storybook" }

Write-Host ""
Write-Host "Frontend:  http://localhost:5173"
Write-Host "API docs:  http://localhost:8000/docs"
if ($Storybook) { Write-Host "Storybook: http://localhost:6006" }
Write-Host "Local demo login (synthetic seed): demo@mailpilot.test / mailpilot-demo-password"
