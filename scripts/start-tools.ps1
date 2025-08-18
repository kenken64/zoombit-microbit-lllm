param(
  [int]$Port = 3000
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$toolsDir = Join-Path $repoRoot 'pxt-zoombit\tools'
$serverJs = Join-Path $toolsDir 'dist\server.js'
$pidTools = Join-Path $repoRoot '.pid.tools-server'

Write-Host "[tools] Installing Node deps..." -ForegroundColor Cyan
Push-Location $toolsDir
try {
  if (Test-Path 'package-lock.json') {
    npm ci | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "[tools] npm ci failed (lock out of sync). Falling back to npm install..."
      npm install | Out-Null
    }
  } else {
    npm install | Out-Null
  }
} finally { Pop-Location }

Write-Host "[tools] Compiling server..." -ForegroundColor Cyan
Push-Location $toolsDir
try { npx -y tsc -p . | Out-Null } finally { Pop-Location }

if (-not (Test-Path $serverJs)) { throw "Server output not found: $serverJs" }

Write-Host "[tools] Starting tools server on port $Port..." -ForegroundColor Cyan
$env:PORT = "$Port"
$server = Start-Process -FilePath 'node' -ArgumentList @("`"$serverJs`"") -PassThru -NoNewWindow
try { Set-Content -LiteralPath $pidTools -Value $server.Id -Encoding ascii } catch { }
Write-Host "[tools] PID=$($server.Id). Visit http://localhost:$Port" -ForegroundColor DarkGray
try {
  Wait-Process -Id $server.Id
} finally {
  if (Test-Path -LiteralPath $pidTools) { Remove-Item -LiteralPath $pidTools -Force -ErrorAction SilentlyContinue }
}
