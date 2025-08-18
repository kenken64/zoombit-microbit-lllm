$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$mcpDir = Join-Path $repoRoot 'mcp-codes-server'
$pidMcp = Join-Path $repoRoot '.pid.mcp-server'
$env:CODES_MD_PATH = Join-Path $repoRoot 'codes.md'

# Detect python
$pythonExe = $env:PYTHON_EXE
if (-not $pythonExe) {
  if (Get-Command python -ErrorAction SilentlyContinue) { $pythonExe = 'python' }
  elseif (Get-Command py -ErrorAction SilentlyContinue) { $pythonExe = 'py' }
}

# Prepare venv
$venvDir = Join-Path $mcpDir '.venv'
$venvPy = Join-Path $venvDir 'Scripts\python.exe'
if (-not (Test-Path $venvPy) -and $pythonExe) {
  Write-Host "[mcp] Creating venv at $venvDir..." -ForegroundColor Cyan
  & $pythonExe -m venv $venvDir | Out-Null
}
if ((Test-Path (Join-Path $mcpDir 'requirements.txt')) -and (Test-Path $venvPy)) {
  Write-Host "[mcp] Installing requirements..." -ForegroundColor Cyan
  & $venvPy -m pip install -r (Join-Path $mcpDir 'requirements.txt') | Out-Null
}

# Install the MCP package in editable mode so `-m mcp_codes_server.server` resolves (src layout)
if ((Test-Path (Join-Path $mcpDir 'pyproject.toml')) -and (Test-Path $venvPy)) {
  Write-Host "[mcp] Installing package (editable)..." -ForegroundColor Cyan
  Push-Location $mcpDir
  try { & $venvPy -m pip install -e . | Out-Null } finally { Pop-Location }
}

# Start server
$pyToUse = $null
if (Test-Path $venvPy) { $pyToUse = $venvPy } else { $pyToUse = $pythonExe }
if (-not $pyToUse) { throw 'Python not found. Set PYTHON_EXE or install Python.' }

Write-Host '[mcp] Starting MCP codes server...' -ForegroundColor Cyan
$mcp = Start-Process -FilePath $pyToUse -ArgumentList @('-m','mcp_codes_server.server') -PassThru -NoNewWindow -WorkingDirectory $mcpDir
try { Set-Content -LiteralPath $pidMcp -Value $mcp.Id -Encoding ascii } catch { }
Write-Host "[mcp] PID=$($mcp.Id)" -ForegroundColor DarkGray
try {
  Wait-Process -Id $mcp.Id
} finally {
  if (Test-Path -LiteralPath $pidMcp) { Remove-Item -LiteralPath $pidMcp -Force -ErrorAction SilentlyContinue }
}
