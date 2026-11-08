$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodePath = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $nodePath)) { throw 'Node.js is required. Install Node 22 or later, then run this launcher again.' }
if (-not (Test-Path -LiteralPath 'dist\index.html')) { throw 'Build the app first: pnpm install, then pnpm build.' }
$previewReady = $false
try { $previewReady = (Invoke-WebRequest 'http://127.0.0.1:5173/' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200 } catch { $previewReady = $false }
if (-not $previewReady) {
  Start-Process -FilePath $nodePath -ArgumentList 'scripts/serve.mjs --port 5173' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
  for ($attempt=0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 250
    try { $previewReady = (Invoke-WebRequest 'http://127.0.0.1:5173/' -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200; if ($previewReady) { break } } catch { }
  }
}
if (-not $previewReady) { throw 'The preview did not start. Run node scripts/serve.mjs in this directory to see the error.' }
Write-Host 'MatriSync is ready: http://127.0.0.1:5173/'
Start-Process 'http://127.0.0.1:5173/'
