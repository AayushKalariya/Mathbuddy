param(
    [string]$BindAddress = '127.0.0.1',
    [ValidateRange(1, 65535)]
    [int]$Port = 8000
)

$ErrorActionPreference = 'Stop'
$checkerPython = Join-Path $PSScriptRoot '.checker-venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $checkerPython)) {
    throw 'Checker environment missing. Follow CHECKER_TESTING.md to create .checker-venv.'
}
Push-Location $PSScriptRoot
try {
    Write-Host "Math Buddy workspace (if built): http://127.0.0.1:$Port/"
    Write-Host "Math Buddy API explorer: http://127.0.0.1:$Port/docs"
    if ($BindAddress -eq '0.0.0.0') {
        Write-Host "For iPad, use http://<your laptop LAN IP>:$Port/docs on the same network."
    }
    & $checkerPython -m uvicorn backend.app:app --host $BindAddress --port $Port
    if ($LASTEXITCODE -ne 0) { throw "Checker exited with code $LASTEXITCODE." }
}
finally {
    Pop-Location
}
