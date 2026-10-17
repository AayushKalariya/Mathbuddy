param(
    [string]$BindAddress = '127.0.0.1',
    [ValidateRange(1, 65535)]
    [int]$Port = 8000,
    [switch]$Build
)

$ErrorActionPreference = 'Stop'
$workspacePython = Join-Path $PSScriptRoot '.checker-venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $workspacePython)) {
    throw 'Checker environment missing. Follow WORKSPACE_TESTING.md.'
}
if ($Build -or -not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'frontend\dist\index.html'))) {
    Push-Location (Join-Path $PSScriptRoot 'frontend')
    try {
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' }
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    }
    finally { Pop-Location }
}
Push-Location $PSScriptRoot
try {
    Write-Host "Math Buddy workspace: http://127.0.0.1:$Port/"
    Write-Host "API explorer: http://127.0.0.1:$Port/docs"
    if ($BindAddress -eq '0.0.0.0') {
        Write-Host "For iPad, use http://<your laptop LAN IP>:$Port/ on the same network."
    }
    & $workspacePython -m uvicorn backend.app:app --host $BindAddress --port $Port
    if ($LASTEXITCODE -ne 0) { throw "Math Buddy exited with code $LASTEXITCODE." }
}
finally { Pop-Location }
