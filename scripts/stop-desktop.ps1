$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$pidDesktop = Join-Path $repoRoot '.pid.desktop'

function Stop-ByPid([int]$targetPid) {
  try {
  Stop-Process -Id $targetPid -ErrorAction Stop
  Write-Host "Stopped desktop app (PID=${targetPid})"
  } catch {
  Write-Warning "Failed to stop PID ${targetPid}: $($_)"
  }
}

if (Test-Path -LiteralPath $pidDesktop) {
  $raw = Get-Content -LiteralPath $pidDesktop -TotalCount 1 -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($raw -match '^(\d+)$') {
    $targetPid = [int]$Matches[1]
    try { Stop-ByPid $targetPid } finally { Remove-Item -LiteralPath $pidDesktop -Force -ErrorAction SilentlyContinue }
    exit 0
  }
}

# Fallback: stop npm electron process within zoombit-desktop
$desktopDir = Join-Path $repoRoot 'zoombit-desktop'
$pattern = [Regex]::Escape($desktopDir)
$procs = Get-CimInstance Win32_Process | Where-Object {
  ($_.Name -match 'node(.exe)?' -or $_.Name -match 'npm(.cmd)?') -and ($_.CommandLine -match 'electron') -and ($_.CommandLine -match $pattern)
}
if ($procs) {
  foreach ($p in $procs) {
    try { Stop-Process -Id $p.ProcessId -ErrorAction Stop; Write-Host "Stopped desktop app (PID=$($p.ProcessId))" } catch { Write-Warning $_ }
  }
} else {
  Write-Host 'No running desktop app found.'
}
