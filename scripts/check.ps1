<#
.SYNOPSIS
  Runs every automated check: backend lint/types/tests, frontend typecheck/lint/tests/build/Storybook build.
  Integration tests need the local Supabase stack (npx supabase start). Use -E2E to also run the
  Playwright browser tests (requires API, worker and frontend running, e.g. via scripts\dev.ps1).
#>
param([switch]$E2E)
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$py = Join-Path $root "backend\.venv\Scripts\python.exe"

function Step($name, [scriptblock]$block) {
  Write-Host "`n=== $name ===" -ForegroundColor Cyan
  & $block
  if ($LASTEXITCODE -ne 0) { throw "$name failed (exit $LASTEXITCODE)" }
}

Push-Location (Join-Path $root "backend")
try {
  Step "backend: ruff" { & $py -m ruff check . }
  Step "backend: mypy" { & $py -m mypy app }
  Step "backend: pytest" { & $py -m pytest -q -rs }
} finally { Pop-Location }

Push-Location (Join-Path $root "frontend")
try {
  Step "frontend: typecheck" { npm run typecheck }
  Step "frontend: lint" { npm run lint }
  Step "frontend: tests (components, stories, a11y)" { npm test }
  Step "frontend: production build" { npm run build }
  Step "frontend: storybook build" { npm run build-storybook }
  if ($E2E) { Step "frontend: playwright e2e" { npx playwright test } }
} finally { Pop-Location }

Write-Host "`nAll checks passed." -ForegroundColor Green
