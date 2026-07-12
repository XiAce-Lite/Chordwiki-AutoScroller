# Package Chordwiki-AutoScroller for Chrome Web Store / Firefox Add-ons (AMO).
# Usage: .\package-extension.ps1
#        .\package-extension.ps1 -Target chrome
#        .\package-extension.ps1 -Target firefox
#        .\package-extension.ps1 -Target firefox -OutputDir release

param(
    [ValidateSet('chrome', 'firefox')]
    [string]$Target = 'chrome',
    [string]$OutputDir = "dist"
)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
if (-not $root) { $root = Get-Location }

$includeFiles = @(
    "background.js",
    "content.js",
    "styles.css",
    "popup.html",
    "popup.js",
    "options.html",
    "options.js"
)

$includeDirs = @("icons")

if ($Target -eq 'firefox') {
    $manifestSourceRel = "manifest.firefox.json"
    $zipSuffix = "-firefox"
} else {
    $manifestSourceRel = "manifest.json"
    $zipSuffix = ""
}

$manifestSourcePath = Join-Path $root $manifestSourceRel
if (-not (Test-Path -LiteralPath $manifestSourcePath)) {
    if ($Target -eq 'chrome') {
        throw "manifest.json not found. Copy manifest.example.json to manifest.json first."
    }
    throw "$manifestSourceRel not found."
}

$manifest = Get-Content -LiteralPath $manifestSourcePath -Raw -Encoding UTF8 | ConvertFrom-Json
$version = $manifest.version
if (-not $version) {
    throw "$manifestSourceRel has no version field."
}

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

$zipName = "Chordwiki-AutoScroller-$version$zipSuffix.zip"
$zipPath = Join-Path $outDir $zipName
$staging = Join-Path ([System.IO.Path]::GetTempPath()) ("Chordwiki-AutoScroller-staging-" + [guid]::NewGuid().ToString("N"))

New-Item -ItemType Directory -Path $staging -Force | Out-Null

Copy-Item -LiteralPath $manifestSourcePath -Destination (Join-Path $staging "manifest.json") -Force
foreach ($rel in $includeFiles) {
    Copy-Item -LiteralPath (Join-Path $root $rel) -Destination (Join-Path $staging $rel) -Force
}
foreach ($rel in $includeDirs) {
    Copy-Item -LiteralPath (Join-Path $root $rel) -Destination (Join-Path $staging $rel) -Recurse -Force
}

if ($Target -eq 'firefox') {
    $unpackedDir = Join-Path $outDir "firefox-unpacked"
    if (Test-Path -LiteralPath $unpackedDir) {
        Remove-Item -LiteralPath $unpackedDir -Recurse -Force
    }
    Copy-Item -LiteralPath $staging -Destination $unpackedDir -Recurse -Force
}

if (Test-Path -LiteralPath $zipPath) {
    Remove-Item -LiteralPath $zipPath -Force
}

# Compress-Archive は Windows でエントリ名に \ を使うため AMO が拒否する。
# ZIP 仕様どおり / 区切りで書き込む。
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($zipPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    $stagingFull = (Resolve-Path -LiteralPath $staging).Path
    Get-ChildItem -LiteralPath $staging -Recurse -File | ForEach-Object {
        $rel = $_.FullName.Substring($stagingFull.Length).TrimStart('\', '/')
        $entryName = $rel.Replace('\', '/')
        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip,
            $_.FullName,
            $entryName,
            [System.IO.Compression.CompressionLevel]::Optimal
        )
    }
}
finally {
    $zip.Dispose()
}

Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue

$sizeKb = [math]::Round((Get-Item -LiteralPath $zipPath).Length / 1024, 1)
Write-Host ('Created: {0} ({1} KB)' -f $zipPath, $sizeKb)
Write-Host "Version: $version"
Write-Host "Target: $Target"
if ($Target -eq 'firefox') {
    Write-Host ('Unpacked (about:debugging): {0}' -f (Join-Path $outDir "firefox-unpacked"))
    Write-Host "Upload the ZIP at https://addons.mozilla.org/developers/ (Submit a New Add-on)."
} else {
    Write-Host "Upload this ZIP in Chrome Web Store Developer Dashboard (Package tab)."
}
