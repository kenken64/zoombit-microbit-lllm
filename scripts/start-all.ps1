param(
  [int]$Port = 3000
)

$ErrorActionPreference = "Stop"

# Paths
$repoRoot = Split-Path -Parent $PSScriptRoot
$toolsDir = Join-Path $repoRoot "pxt-zoombit\tools"
$serverJs = Join-Path $toolsDir "dist\server.js"
$desktopDir = Join-Path $repoRoot "zoombit-desktop"

# 1) Compile tools server (TypeScript)
Write-Host "Compiling tools server..." -ForegroundColor Cyan
pushd $toolsDir
try {
  npx -y tsc -p . | Out-Null
} finally {
  popd
}

if (-not (Test-Path $serverJs)) {
  Write-Error "Server output not found: $serverJs"
  exit 1
}

# 2) Start the tools server
Write-Host "Starting tools server on port $Port..." -ForegroundColor Cyan
$env:PORT = "$Port"
$server = Start-Process -FilePath "node" -ArgumentList @("`"$serverJs`"") -PassThru -WindowStyle Minimized
Start-Sleep -Seconds 1

# 3) Launch desktop app (production build + electron)
Write-Host "Building and launching desktop app..." -ForegroundColor Cyan
pushd $desktopDir
try {
  npm run build:app | Out-Null
  npm run electron | Out-Null
} finally {
  popd
}

# 4) Cleanup on exit
if ($server -and -not $server.HasExited) {
  Write-Host "Stopping tools server (PID=$($server.Id))" -ForegroundColor Yellow
  Stop-Process -Id $server.Id -Force
}

