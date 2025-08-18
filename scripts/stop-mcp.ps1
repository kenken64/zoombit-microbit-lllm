$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$pidMcp = Join-Path $repoRoot '.pid.mcp-server'

function Stop-ByPid([int]$targetPid) {
  try {
  Stop-Process -Id $targetPid -ErrorAction Stop
  Write-Host "Stopped MCP server (PID=${targetPid})"
  } catch {
  Write-Warning "Failed to stop PID ${targetPid}: $($_)"
  }
}

if (Test-Path -LiteralPath $pidMcp) {
  $raw = Get-Content -LiteralPath $pidMcp -TotalCount 1 -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($raw -match '^(\d+)$') {
    $targetPid = [int]$Matches[1]
    try { Stop-ByPid $targetPid } finally { Remove-Item -LiteralPath $pidMcp -Force -ErrorAction SilentlyContinue }
    exit 0
  }
}

# Fallback: look for python process running mcp_codes_server.server in the MCP folder
$repoRoot = Split-Path -Parent $PSScriptRoot
$mcpDir = Join-Path $repoRoot 'mcp-codes-server'
$pattern = [Regex]::Escape($mcpDir)
$procs = Get-CimInstance Win32_Process | Where-Object {
  ($_.Name -match 'python(.exe)?') -and ($_.CommandLine -match 'mcp_codes_server\.server') -and ($_.CommandLine -match $pattern)
}
if ($procs) {
  foreach ($p in $procs) {
    try { Stop-Process -Id $p.ProcessId -ErrorAction Stop; Write-Host "Stopped MCP server (PID=$($p.ProcessId))" } catch { Write-Warning $_ }
  }
} else {
  Write-Host 'No running MCP server found.'
}
