$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$pidTools = Join-Path $repoRoot '.pid.tools-server'

function Stop-ByPid([int]$targetPid) {
  try {
  Stop-Process -Id $targetPid -ErrorAction Stop
  Write-Host "Stopped tools server (PID=${targetPid})"
  } catch {
  Write-Warning "Failed to stop PID ${targetPid}: $($_)"
  }
}

if (Test-Path -LiteralPath $pidTools) {
  $raw = Get-Content -LiteralPath $pidTools -TotalCount 1 -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($raw -match '^(\d+)$') {
    $targetPid = [int]$Matches[1]
    try { Stop-ByPid $targetPid } finally { Remove-Item -LiteralPath $pidTools -Force -ErrorAction SilentlyContinue }
    exit 0
  }
}

# Fallback: stop by command line matching server.js under tools
$procs = Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'node(.exe)?' -and $_.CommandLine -match 'pxt-zoombit\\tools.+server\.js' }
if ($procs) {
  foreach ($p in $procs) {
    try { Stop-Process -Id $p.ProcessId -ErrorAction Stop; Write-Host "Stopped tools server (PID=$($p.ProcessId))" } catch { Write-Warning $_ }
  }
} else {
  Write-Host 'No running tools server found.'
}
