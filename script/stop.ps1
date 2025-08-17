<#
.SYNOPSIS
  Stop a running service/process for this project by PID file or process name.

.DESCRIPTION
  Attempts to stop a process in a cross-platform friendly way on PowerShell.
  Priority:
    1) If a PID file is provided (default: ./.pid), read PID and stop that process.
    2) Else, if a process name is provided via -Name, stop by name.

.PARAMETER PidFile
  Path to a PID file containing a numeric PID. Default is ./.pid.

.PARAMETER Name
  Process name to stop if no PID file is present or valid.

.PARAMETER Force
  If specified, escalates to a forceful kill when graceful stop fails.

.EXAMPLE
  ./script/stop.ps1 -PidFile ./.pid

.EXAMPLE
  ./script/stop.ps1 -Name "zoombit"

.NOTES
  Requires PowerShell 7+ for consistent cross-platform behavior.
#>
[CmdletBinding()] param(
  [string]$PidFile = "./.pid",
  [string]$Name,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

function Stop-ByPid {
  param([int]$Pid)
  try {
    if ($IsWindows) {
      # Try graceful close first on Windows using Stop-Process (sends CTRL-C to console apps only if group-aware)
      Stop-Process -Id $Pid -ErrorAction Stop
    } else {
      # On POSIX, try SIGTERM first
      kill -TERM $Pid 2>$null
      Start-Sleep -Seconds 2
      if (Get-Process -Id $Pid -ErrorAction SilentlyContinue) {
        if ($Force) {
          Write-Host "Process $Pid still running. Forcing kill..."
          kill -KILL $Pid 2>$null
        } else {
          throw "Process $Pid did not exit after SIGTERM. Re-run with -Force to SIGKILL."
        }
      }
    }
    Write-Host "Stopped process with PID $Pid"
  } catch {
    if ($Force -and $IsWindows) {
      Write-Host "Escalating: forcefully terminating PID $Pid"
      Stop-Process -Id $Pid -Force -ErrorAction SilentlyContinue
    } else {
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
      if ($IsWindows) {
        Stop-Process -Id $p.Id -ErrorAction Stop
      } else {
        kill -TERM $p.Id 2>$null
      }
      Write-Host "Stopped '$ProcName' (PID $($p.Id))"
    } catch {
      if ($Force) {
        if ($IsWindows) {
          Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        } else {
          kill -KILL $p.Id 2>$null
        }
        Write-Host "Force-stopped '$ProcName' (PID $($p.Id))"
      } else {
        Write-Warning "Failed to stop PID $($p.Id): $_"
      }
    }
  }
}

# Resolve PID from file if available
$pidFromFile = $null
if (Test-Path -LiteralPath $PidFile) {
  try {
    $raw = Get-Content -LiteralPath $PidFile -TotalCount 1 -ErrorAction Stop | Select-Object -First 1
    if ($raw -match '^(\d+)$') { $pidFromFile = [int]$Matches[1] }
  } catch {
    Write-Warning "Failed to read PID file '$PidFile': $_"
  }
}

if ($pidFromFile) {
  Stop-ByPid -Pid $pidFromFile
  return
}

if ($Name) {
  Stop-ByName -ProcName $Name
  return
}

Write-Error "No PID file found or valid PID, and no -Name provided. Specify -PidFile or -Name."
exit 1

