$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$desktopDir = Join-Path $repoRoot 'zoombit-desktop'
$pidDesktop = Join-Path $repoRoot '.pid.desktop'

function Stop-DesktopProcesses {
  param([string]$dir)
  try {
    $pattern = [Regex]::Escape($dir)
    $procs = Get-CimInstance Win32_Process | Where-Object {
      ($_.Name -match 'electron(.exe)?' -or ($_.Name -match 'node(.exe)?' -and $_.CommandLine -match 'electron')) -and ($_.CommandLine -match $pattern)
    }
    if ($procs) {
      foreach ($p in $procs) {
        try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; Write-Host "[desktop] Stopped running Electron (PID=$($p.ProcessId))" -ForegroundColor Yellow } catch { }
      }
      Start-Sleep -Milliseconds 500
    }
  } catch { }
}

Write-Host "[desktop] Building app..." -ForegroundColor Cyan
Push-Location $desktopDir
try {
  # Install dependencies if needed
  Stop-DesktopProcesses -dir $desktopDir
  $installed = $false
  if (Test-Path 'package-lock.json') {
    for ($i = 0; $i -lt 2 -and -not $installed; $i++) {
      npm ci | Out-Null
      if ($LASTEXITCODE -eq 0) { $installed = $true; break }
      Write-Warning "[desktop] npm ci failed (attempt $($i+1)). Stopping Electron and retrying..."
      Stop-DesktopProcesses -dir $desktopDir
      Start-Sleep -Milliseconds 500
      if (Test-Path 'node_modules') { try { Remove-Item -Recurse -Force 'node_modules' -ErrorAction SilentlyContinue } catch { } }
    }
  }
  if (-not $installed) {
    npm install | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "[desktop] npm install failed. Retrying once after stopping Electron..."
      Stop-DesktopProcesses -dir $desktopDir
      Start-Sleep -Milliseconds 500
      if (Test-Path 'node_modules') { try { Remove-Item -Recurse -Force 'node_modules' -ErrorAction SilentlyContinue } catch { } }
      npm install | Out-Null
      if ($LASTEXITCODE -ne 0) { throw "[desktop] npm install failed (see npm logs)." }
    }
  }

  npm run build:app | Out-Null
  Write-Host "[desktop] Launching Electron..." -ForegroundColor Cyan
  # Launch Electron and stay in foreground
  $electronProc = Start-Process -FilePath 'npm' -ArgumentList @('run','electron') -PassThru -NoNewWindow
  try { Set-Content -LiteralPath $pidDesktop -Value $electronProc.Id -Encoding ascii } catch { }
  Write-Host "[desktop] PID=$($electronProc.Id)" -ForegroundColor DarkGray
  try {
    Wait-Process -Id $electronProc.Id
  } finally {
    if (Test-Path -LiteralPath $pidDesktop) { Remove-Item -LiteralPath $pidDesktop -Force -ErrorAction SilentlyContinue }
  }
} finally {
  Pop-Location
}
