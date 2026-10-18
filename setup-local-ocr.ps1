$ErrorActionPreference = 'Stop'
Write-Host 'Installing prequantized 4-bit GLM-OCR and its 4-bit vision encoder. No full-precision model is loaded.'
Push-Location $PSScriptRoot
try {
    & (Join-Path $PSScriptRoot '.checker-venv\Scripts\python.exe') -m backend.recognition.install_glm
    if ($LASTEXITCODE -ne 0) { throw '4-bit OCR installation failed. See LOCAL_OCR_SETUP.md.' }
}
finally { Pop-Location }
