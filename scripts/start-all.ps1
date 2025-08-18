param(
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"

# Paths
$repoRoot = Split-Path -Parent $PSScriptRoot
$toolsDir = Join-Path $repoRoot "pxt-zoombit\tools"
$serverJs = Join-Path $toolsDir "dist\server.js"
$desktopDir = Join-Path $repoRoot "zoombit-desktop"
${null} = New-Item -ItemType Directory -Path $repoRoot -ErrorAction SilentlyContinue
$mcpDir = Join-Path $repoRoot "mcp-codes-server"
$pidTools = Join-Path $repoRoot ".pid.tools-server"
$pidMcp = Join-Path $repoRoot ".pid.mcp-server"

# 1) Install Node deps for tools and compile
Write-Host "Installing tools Node dependencies..." -ForegroundColor Cyan
Push-Location $toolsDir
try {
  if (Test-Path "package-lock.json") {
    npm ci | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "[tools] npm ci failed (lock out of sync). Falling back to npm install..."
      npm install | Out-Null
    }
  } else { npm install | Out-Null }
} finally { Pop-Location }

Write-Host "Compiling tools server..." -ForegroundColor Cyan
Push-Location $toolsDir
try {
  npx -y tsc -p . | Out-Null
} finally {
  Pop-Location
}

if (-not (Test-Path $serverJs)) {
  Write-Error "Server output not found: $serverJs"
  exit 1
}

# 2) Start the tools server
Write-Host "Starting tools server on port $Port..." -ForegroundColor Cyan
$env:PORT = "$Port"
$env:AI_DEBUG = "1"
$server = Start-Process -FilePath "node" -ArgumentList @("`"$serverJs`"") -PassThru -WindowStyle Minimized
Start-Sleep -Seconds 1
try { Set-Content -LiteralPath $pidTools -Value $server.Id -Encoding ascii } catch { }

# 2b) Prepare and start the MCP codes server (Python)
Write-Host "Preparing MCP codes server environment..." -ForegroundColor Cyan
$env:CODES_MD_PATH = Join-Path $repoRoot "codes.md"
$pythonExe = $env:PYTHON_EXE
if (-not $pythonExe) {
  if (Get-Command python -ErrorAction SilentlyContinue) { $pythonExe = "python" }
  elseif (Get-Command py -ErrorAction SilentlyContinue) { $pythonExe = "py" }
}
$venvDir = Join-Path $mcpDir ".venv"
$venvPy = Join-Path $venvDir "Scripts\python.exe"
try {
  if (-not (Test-Path $venvPy) -and $pythonExe) {
    Write-Host "Creating Python venv at $venvDir..." -ForegroundColor Cyan
    & $pythonExe -m venv $venvDir | Out-Null
  }
  if ((Test-Path (Join-Path $mcpDir "requirements.txt")) -and (Test-Path $venvPy)) {
    Write-Host "Installing MCP requirements..." -ForegroundColor Cyan
    & $venvPy -m pip install -r (Join-Path $mcpDir "requirements.txt") | Out-Null
  }
  if ((Test-Path (Join-Path $mcpDir "pyproject.toml")) -and (Test-Path $venvPy)) {
    Write-Host "Installing MCP package (editable)..." -ForegroundColor Cyan
    Push-Location $mcpDir
    try { & $venvPy -m pip install -e . | Out-Null } finally { Pop-Location }
  }
} catch { Write-Warning "Failed to prepare MCP venv: $($_)" }

Write-Host "Starting MCP codes server..." -ForegroundColor Cyan
$mcpPython = $null
if (Test-Path $venvPy) { $mcpPython = $venvPy } else { $mcpPython = $pythonExe }
$mcp = $null
if ($mcpPython) {
  try {
    $mcp = Start-Process -FilePath $mcpPython -ArgumentList @('-m','mcp_codes_server.server') -PassThru -WindowStyle Minimized -WorkingDirectory $mcpDir
    Start-Sleep -Milliseconds 500
    try { Set-Content -LiteralPath $pidMcp -Value $mcp.Id -Encoding ascii } catch { }
    Write-Host "MCP server PID=$($mcp.Id)" -ForegroundColor DarkGray
  } catch {
    Write-Warning "Failed to start MCP server with ${mcpPython}: $($_)"
  }
} else {
  Write-Warning "Python not found. Set PYTHON_EXE or install Python to run MCP server."
}

# 3) Launch desktop app (production build + electron)
Write-Host "Building and launching desktop app..." -ForegroundColor Cyan
Push-Location $desktopDir
try {
  # Ensure desktop dependencies are installed
  Write-Host "Installing desktop Node dependencies..." -ForegroundColor Cyan
  function Stop-DesktopProcesses { param([string]$dir) try { $pattern = [Regex]::Escape($dir); $procs = Get-CimInstance Win32_Process | Where-Object { ($_.Name -match 'electron(.exe)?' -or ($_.Name -match 'node(.exe)?' -and $_.CommandLine -match 'electron')) -and ($_.CommandLine -match $pattern) }; if ($procs) { foreach ($p in $procs) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch { } } Start-Sleep -Milliseconds 500 } } catch { } }
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
  npm run electron | Out-Null
} finally {
  Pop-Location
}

# 4) Cleanup on exit
if ($server -and -not $server.HasExited) {
  Write-Host "Stopping tools server (PID=$($server.Id))" -ForegroundColor Yellow
  Stop-Process -Id $server.Id -Force
}

if ($mcp -and -not $mcp.HasExited) {
  Write-Host "Stopping MCP server (PID=$($mcp.Id))" -ForegroundColor Yellow
  Stop-Process -Id $mcp.Id -Force
}

foreach ($pf in @($pidTools, $pidMcp)) {
  if (Test-Path -LiteralPath $pf) {
    try { Remove-Item -LiteralPath $pf -Force -ErrorAction SilentlyContinue } catch { }
  }
}

