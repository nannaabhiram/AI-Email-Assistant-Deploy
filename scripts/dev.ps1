<#
.SYNOPSIS
  Starts the MailPilot AI development stack. Thin wrapper around the npm launcher
  (scripts\launcher), which starts and verifies the Spark 2 tunnel, API, worker and frontend,
  and tracks the processes it owns so `npm stop` can stop them later.

.EXAMPLE
  .\scripts\dev.ps1               # same as: npm start
  .\scripts\dev.ps1 -Restart      # same as: npm run restart (stop MailPilot processes, then start)
  .\scripts\dev.ps1 -Storybook    # also open Storybook on :6006 in its own window
  .\scripts\dev.ps1 -NoBrowser    # do not open the browser
#>
param([switch]$Storybook, [switch]$Restart, [switch]$NoBrowser)
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$launcherArgs = @((Join-Path $root "scripts\launcher\index.mjs"), $(if ($Restart) { "restart" } else { "start" }))
if ($NoBrowser) { $launcherArgs += "--no-browser" }
& node @launcherArgs
$code = $LASTEXITCODE
if ($code -eq 0 -and $Storybook) {
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle='MailPilot Storybook'; Set-Location '$root\frontend'; npm run storybook"
  Write-Host "Storybook: http://localhost:6006 (close its window to stop it)"
}
exit $code
