<#
.SYNOPSIS
  Opens an SSH local port-forward from this machine to the inference server on the DGX Spark.

.DESCRIPTION
  Reads DGX_SSH_HOST, DGX_SSH_USER, DGX_SSH_PORT, DGX_SSH_KEY_PATH, DGX_REMOTE_LLM_HOST,
  DGX_REMOTE_LLM_PORT and DGX_LOCAL_TUNNEL_PORT from backend\.env (or parameters).
  The inference server stays bound to localhost on the DGX; nothing is exposed publicly.
  Then set DGX_LLM_API_BASE_URL=http://127.0.0.1:<LocalPort>/v1 in backend\.env.

.EXAMPLE
  .\scripts\dgx-tunnel.ps1
  .\scripts\dgx-tunnel.ps1 -SshHost spark2 -RemotePort 8000 -LocalPort 18000
#>
param(
  [string]$SshHost,
  [string]$User,
  [int]$SshPort = 0,
  [string]$KeyPath,
  [string]$RemoteHost,
  [int]$RemotePort = 0,
  [int]$LocalPort = 0
)

$ErrorActionPreference = "Stop"
$envFile = Join-Path $PSScriptRoot "..\backend\.env"
$cfg = @{}
if (Test-Path $envFile) {
  Get-Content $envFile | Where-Object { $_ -match '^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(#.*)?$' } | ForEach-Object {
    if ($_ -match '^\s*([A-Z0-9_]+)\s*=\s*([^#]*)') { $cfg[$Matches[1]] = $Matches[2].Trim() }
  }
}
function Pick($value, $key, $default) { if ($value) { return $value }; if ($cfg[$key]) { return $cfg[$key] }; return $default }

$SshHost    = Pick $SshHost    "DGX_SSH_HOST" ""
$User       = Pick $User       "DGX_SSH_USER" ""
$SshPort    = [int](Pick ($(if ($SshPort) { $SshPort })) "DGX_SSH_PORT" 22)
$KeyPath    = Pick $KeyPath    "DGX_SSH_KEY_PATH" ""
$RemoteHost = Pick $RemoteHost "DGX_REMOTE_LLM_HOST" "127.0.0.1"
$RemotePort = [int](Pick ($(if ($RemotePort) { $RemotePort })) "DGX_REMOTE_LLM_PORT" 0)
$LocalPort  = [int](Pick ($(if ($LocalPort) { $LocalPort })) "DGX_LOCAL_TUNNEL_PORT" 18000)

if (-not $SshHost) { throw "DGX_SSH_HOST is not set (backend\.env or -SshHost)" }
if (-not $RemotePort) { throw "DGX_REMOTE_LLM_PORT is not set: the port the inference server listens on, on the DGX" }

$target = if ($User) { "$User@$SshHost" } else { $SshHost }
# BatchMode: key authentication only, never an interactive password prompt (this may run hidden).
$sshArgs = @("-N", "-o", "BatchMode=yes", "-o", "ExitOnForwardFailure=yes", "-o", "ServerAliveInterval=30", "-o", "ServerAliveCountMax=3",
          "-o", "ConnectTimeout=15", "-p", "$SshPort", "-L", "127.0.0.1:${LocalPort}:${RemoteHost}:${RemotePort}")
if ($KeyPath) { $sshArgs += @("-i", [Environment]::ExpandEnvironmentVariables($KeyPath.Replace('$HOME', $HOME)), "-o", "IdentitiesOnly=yes") }
$sshArgs += $target

Write-Host "Forwarding 127.0.0.1:$LocalPort  ->  $RemoteHost`:$RemotePort on $target (Ctrl+C to stop)"
Write-Host "Backend setting: DGX_LLM_API_BASE_URL=http://127.0.0.1:$LocalPort/v1"
while ($true) {
  & ssh @sshArgs
  Write-Warning "SSH tunnel exited (code $LASTEXITCODE). Reconnecting in 5 seconds..."
  Start-Sleep -Seconds 5
}
