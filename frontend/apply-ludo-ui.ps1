$ErrorActionPreference = 'Stop'

$root = (Get-Location).Path
if ((Split-Path $root -Leaf) -ne 'frontend') {
  Write-Host 'Run this script from the frontend folder:' -ForegroundColor Yellow
  Write-Host 'cd C:\Users\bhask\OneDrive\Desktop\clinets\gaming-platform\frontend'
  exit 1
}

$ludoPage = Join-Path $root 'src\pages\user\Ludo.tsx'
$ludoCss  = Join-Path $root 'src\components\ludo\ludo-king.css'

if (!(Test-Path $ludoPage)) { throw "Missing $ludoPage" }
if (!(Test-Path $ludoCss)) { throw "Missing $ludoCss" }

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Copy-Item $ludoPage "$ludoPage.backup-$stamp"
Copy-Item $ludoCss "$ludoCss.backup-$stamp"

$base = Split-Path -Parent $PSScriptRoot
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Copy-Item (Join-Path $scriptDir 'Ludo.tsx.new') $ludoPage -Force
Copy-Item (Join-Path $scriptDir 'ludo-king.css.new') $ludoCss -Force

Write-Host ''
Write-Host 'Ludo UI applied.' -ForegroundColor Green
Write-Host 'Changes:' -ForegroundColor Cyan
Write-Host '  - Full square Ludo board; no landscape clipping.'
Write-Host '  - Dice moved below the board.'
Write-Host '  - Removed the duplicate landscape dice slot.'
Write-Host '  - Reference-style header, cards, spacing and responsive layout.'
Write-Host ''
Write-Host 'Start Vite again with: npm run dev' -ForegroundColor Green
