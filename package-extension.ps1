# Package Chordwiki-AutoScroller for Chrome Web Store upload.
# Usage: .\package-extension.ps1
#        .\package-extension.ps1 -OutputDir release

param(
    [string]$OutputDir = "dist"
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
if (-not $root) { $root = Get-Location }

$manifestPath = Join-Path $root "manifest.json"
if (-not (Test-Path -LiteralPath $manifestPath)) {
    throw "manifest.json not found. Copy manifest.example.json to manifest.json first."
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $manifest.version
if (-not $version) {
    throw "manifest.json has no version field."
}

$includeFiles = @(
    "manifest.json",
    "background.js",
    "content.js",
    "styles.css",
    "popup.html",
    "popup.js",
    "options.html",
    "options.js"
)

$includeDirs = @("icons")

$missing = @()
foreach ($rel in $includeFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $root $rel))) {
        $missing += $rel
    }
}
foreach ($rel in $includeDirs) {
    if (-not (Test-Path -LiteralPath (Join-Path $root $rel))) {
        $missing += "$rel\"
    }
}
if ($missing.Count -gt 0) {
    throw ("Missing required files:`n  - " + ($missing -join "`n  - "))
}

$outDir = Join-Path $root $OutputDir
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

$zipName = "Chordwiki-AutoScroller-$version.zip"
$zipPath = Join-Path $outDir $zipName
$staging = Join-Path ([System.IO.Path]::GetTempPath()) ("Chordwiki-AutoScroller-staging-" + [guid]::NewGuid().ToString("N"))

New-Item -ItemType Directory -Path $staging -Force | Out-Null

foreach ($rel in $includeFiles) {
    Copy-Item -LiteralPath (Join-Path $root $rel) -Destination (Join-Path $staging $rel) -Force
}
foreach ($rel in $includeDirs) {
    Copy-Item -LiteralPath (Join-Path $root $rel) -Destination (Join-Path $staging $rel) -Recurse -Force
}

if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $zipPath -CompressionLevel Optimal
Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue

$sizeKb = [math]::Round((Get-Item -LiteralPath $zipPath).Length / 1024, 1)
Write-Host ('Created: {0} ({1} KB)' -f $zipPath, $sizeKb)
Write-Host "Version: $version"
Write-Host "Upload this ZIP in Chrome Web Store Developer Dashboard (Package tab)."
