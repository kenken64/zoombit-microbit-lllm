<#
.SYNOPSIS
  Stop a running service/process for this project by PID file or process name.

.DESCRIPTION
  Attempts to stop a process in a cross-platform friendly way.
  Priority:
    1) If a PID file is provided (default: ./.pid), read PID and stop that process.
    2) Else, if a process name is provided via -Name, stop by name.
    3) Else, stop both project services (tools + MCP) via repo-root PID files.

.PARAMETER PidFile
  Path to a PID file containing a numeric PID. Default is ./.pid.

.PARAMETER Name
  Process name to stop if no PID file is present or valid.

.PARAMETER Force
  If specified, escalates to a forceful kill when graceful stop fails.

.PARAMETER All
  Stop both project services using repo-root PID files.

.EXAMPLE
  ./scripts/stop.ps1 -PidFile ./.pid

.EXAMPLE
  ./scripts/stop.ps1 -Name "node"

.EXAMPLE
  ./scripts/stop.ps1 -All

.NOTES
  Compatible with Windows PowerShell 5.1 and PowerShell 7+.
#>
[CmdletBinding()] param(
  [Alias('PidFile')]
  [string]$ProcessIdFile = "./.pid",
  [string]$Name,
  [switch]$Force,
  [switch]$All
)

$ErrorActionPreference = 'Stop'

# Determine platform (compatible with Windows PowerShell 5.1)
$IsWin = $false
try {
  if ($env:OS -eq 'Windows_NT') { $IsWin = $true }
  elseif ($PSVersionTable.PSEdition -eq 'Desktop') { $IsWin = $true }
}
catch { }

function Stop-ByPid {
  param([int]$ProcessId)
  try {
    if ($IsWin) {
      # Try graceful close first on Windows using Stop-Process (sends CTRL-C to console apps only if group-aware)
      Stop-Process -Id $ProcessId -ErrorAction Stop
    }
    else {
      # On POSIX, try SIGTERM first
      kill -TERM $ProcessId 2>$null
      Start-Sleep -Seconds 2
      if (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) {
        if ($Force) {
          Write-Host "Process $ProcessId still running. Forcing kill..."
          kill -KILL $ProcessId 2>$null
        }
        else {
          throw "Process $ProcessId did not exit after SIGTERM. Re-run with -Force to SIGKILL."
        }
      }
    }
    Write-Host "Stopped process with PID $ProcessId"
  }
  catch {
    if ($Force -and $IsWin) {
      Write-Host "Escalating: forcefully terminating PID $ProcessId"
      Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
    }
    else {
      throw
    }
  }
}

function Stop-ByName {
  param([string]$ProcName)
  $procs = Get-Process -Name $ProcName -ErrorAction SilentlyContinue
  if (-not $procs) {
    Write-Host "No processes found with name '$ProcName'."
    return
  }
  foreach ($p in $procs) {
    try {
      if ($IsWin) {
        Stop-Process -Id $p.Id -ErrorAction Stop
      }
      else {
        kill -TERM $p.Id 2>$null
      }
      Write-Host "Stopped '$ProcName' (PID $($p.Id))"
    }
    catch {
      if ($Force) {
        if ($IsWin) {
          Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        }
        else {
          kill -KILL $p.Id 2>$null
        }
        Write-Host "Force-stopped '$ProcName' (PID $($p.Id))"
      }
      else {
        Write-Warning "Failed to stop PID $($p.Id): $_"
      }
    }
  }
}
# Resolve PID from file if available
$pidFromFile = $null
if (Test-Path -LiteralPath $ProcessIdFile) {
  try {
    $raw = Get-Content -LiteralPath $ProcessIdFile -TotalCount 1 -ErrorAction Stop | Select-Object -First 1
    if ($raw -match '^(\d+)$') { $pidFromFile = [int]$Matches[1] }
  }
  catch {
    Write-Warning "Failed to read PID file '$ProcessIdFile': $_"
  }
}

# Default behavior: if no args, try to stop both known project services via PID files in repo root
$repoRoot = Split-Path -Parent $PSScriptRoot
$pidTools = Join-Path $repoRoot ".pid.tools-server"
$pidMcp = Join-Path $repoRoot ".pid.mcp-server"

function Stop-FromPidFile {
  param([string]$Path)
  if (Test-Path -LiteralPath $Path) {
    $raw = Get-Content -LiteralPath $Path -TotalCount 1 -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($raw -match '^(\d+)$') {
      $p = [int]$Matches[1]
      try { Stop-ByPid -ProcessId $p } finally { Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue }
    }
  }
}

if ($pidFromFile) {
  Stop-ByPid -ProcessId $pidFromFile
  return
}

if ($Name) {
  Stop-ByName -ProcName $Name
  return
}

# If -All specified or no args, stop both project services
if ($All -or ($PSBoundParameters.Count -eq 0)) {
  Stop-FromPidFile -Path $pidTools
  Stop-FromPidFile -Path $pidMcp
  return
}

Write-Error "No PID file found or valid PID, and no -Name provided. Use -All to stop project services, or specify -PidFile or -Name."
exit 1

