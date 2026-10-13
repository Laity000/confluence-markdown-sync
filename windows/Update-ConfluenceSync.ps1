# Windows PowerShell 5.1+, current-user updater. Never executes code from ZIP.
# Install-ConfluenceSyncUpdater.ps1 writes config.json alongside this script.
[CmdletBinding()]
param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Repo = 'Laity000/confluence-markdown-sync'
$ExpectedName = 'Markdown → Confluence 内网同步'
$AllowedFiles = @('manifest.json','background.js','editor.html','editor.css','editor.js','wiki-converter.js','storage-converter.js','sync-core.js','icon16.png','icon48.png','icon128.png')
$StateDir = $PSScriptRoot
$ConfigFile = Join-Path $StateDir 'config.json'
$LockFile = Join-Path $StateDir 'update.lock'
$LogFile = Join-Path $StateDir 'updater.log'

function Log([string]$message) {
    $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $message
    Write-Host $line
    Add-Content -LiteralPath $LogFile -Value $line -Encoding UTF8
}
function ParseVersion([string]$v) {
    if ($v -notmatch '^\d{1,4}(?:\.\d{1,5}){2,3}$') { throw "Invalid version: $v" }
    return [version]$v
}
function GetJson([string]$url) {
    Invoke-RestMethod -Method Get -Uri $url -Headers @{'User-Agent'='ConfluenceMarkdownSyncUpdater';'Accept'='application/vnd.github+json'} -TimeoutSec 45
}
function VerifyManifest([string]$path) {
    $m = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($m.manifest_version -ne 3 -or $m.name -cne $ExpectedName -or !$m.background.service_worker -or $m.background.service_worker -ne 'background.js') {
        throw "Unrecognized extension in $path; refusing to replace."
    }
    [void](ParseVersion ([string]$m.version))
    return $m
}
function SaveUtf8([string]$path,[string]$content) {
    [System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding($false)))
}

if (!(Test-Path -LiteralPath $ConfigFile -PathType Leaf)) { throw "Missing $ConfigFile; first run Install-ConfluenceSyncUpdater.ps1" }
$config = Get-Content -LiteralPath $ConfigFile -Raw -Encoding UTF8 | ConvertFrom-Json
if ($config.repository -cne $Repo) { throw 'Updater repository does not match the pinned project.' }
$target = [System.IO.Path]::GetFullPath([string]$config.extensionPath)
if (![System.IO.Path]::IsPathRooted([string]$config.extensionPath)) { throw 'ExtensionPath must be absolute.' }
if (([System.IO.Path]::GetPathRoot($target)).TrimEnd('\') -eq $target.TrimEnd('\')) { throw 'Refusing to update a drive root.' }
if ($target -eq $StateDir -or $StateDir.StartsWith($target.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Updater and extension directories must not overlap.' }

# Prevent concurrent scheduled runs. Only the current Windows user can access these files.
$mutex = $null
$temp = $null
try {
    $mutex = New-Object System.Threading.Mutex($false, 'Local\ConfluenceMarkdownSyncUpdater-Laity000')
    if (!$mutex.WaitOne(0)) { Log 'An updater instance is already running; skipped.'; exit 0 }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $release = GetJson "https://api.github.com/repos/$Repo/releases/latest"
    $tagMatch = [regex]::Match([string]$release.tag_name, '^v(\d+(?:\.\d+){2,3})$')
    if ($release.draft -or $release.prerelease -or !$tagMatch.Success) {
        throw 'Latest GitHub release is not a stable version.'
    }
    $latest = $tagMatch.Groups[1].Value
    $latestVersion = ParseVersion $latest
    if ((Test-Path -LiteralPath $target) -and (Test-Path -LiteralPath (Join-Path $target 'manifest.json'))) {
        $installed = VerifyManifest (Join-Path $target 'manifest.json')
        $current = ParseVersion ([string]$installed.version)
    } else {
        if ((Test-Path -LiteralPath $target) -and @(Get-ChildItem -LiteralPath $target -Force).Count -gt 0) {
            throw 'The extension path is not empty and has no recognized manifest.json. Refusing to overwrite.'
        }
        $current = [version]'0.0.0'
    }
    if ($latestVersion -le $current) { Log "Up to date: installed=$current, latest=$latest"; exit 0 }
    Log "Found update: $current -> $latest"
    if ($CheckOnly) { Log 'CheckOnly: no files written.'; exit 0 }

    $assetName = "confluence-markdown-sync-extension-v$latest.zip"
    $asset = @($release.assets | Where-Object { $_.name -ceq $assetName })
    $sumAsset = @($release.assets | Where-Object { $_.name -ceq 'SHA256SUMS.txt' })
    if ($asset.Count -ne 1 -or $sumAsset.Count -ne 1) { throw 'Required release ZIP or SHA256SUMS.txt asset was not found.' }
    foreach ($a in @($asset[0],$sumAsset[0])) {
        if ([string]$a.browser_download_url -notlike "https://github.com/$Repo/releases/download/*") {
            throw 'Unexpected release asset host or path.'
        }
    }
    if ($asset[0].size -gt 8388608) { throw 'Release ZIP is unexpectedly large.' }
    $temp = Join-Path $env:TEMP ('ConfluenceSync-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $temp -Force | Out-Null
    $zipPath = Join-Path $temp 'extension.zip'
    $sumPath = Join-Path $temp 'SHA256SUMS.txt'
    Invoke-WebRequest -Uri $asset[0].browser_download_url -OutFile $zipPath -Headers @{'User-Agent'='ConfluenceMarkdownSyncUpdater'} -TimeoutSec 90
    Invoke-WebRequest -Uri $sumAsset[0].browser_download_url -OutFile $sumPath -Headers @{'User-Agent'='ConfluenceMarkdownSyncUpdater'} -TimeoutSec 45
    $sumText = [System.IO.File]::ReadAllText($sumPath)
    $sumRegex = '(?im)^([0-9a-f]{64})\s+\*?' + [regex]::Escape($assetName) + '\s*$'
    $hashMatch = [regex]::Match($sumText,$sumRegex)
    if (!$hashMatch.Success) { throw 'Release checksums file does not match the expected asset.' }
    $digest = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($digest -ne $hashMatch.Groups[1].Value.ToLowerInvariant()) { throw 'ZIP SHA256 does not match release checksum.' }
    if ($asset[0].digest -and [string]$asset[0].digest -cne ('sha256:'+$digest)) { throw 'ZIP does not match GitHub asset digest.' }
    Log "Verified ZIP SHA256 $digest"

    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $stage = Join-Path $temp 'stage'
    New-Item -ItemType Directory -Path $stage -Force | Out-Null
    $archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
    try {
        $entries = @($archive.Entries)
        if ($entries.Count -ne $AllowedFiles.Count) { throw 'Unexpected file count in extension ZIP.' }
        $seen = @{}
        $totalSize = 0L
        foreach ($entry in $entries) {
            $name = [string]$entry.FullName
            if ($AllowedFiles -cnotcontains $name -or $seen.ContainsKey($name)) { throw "Unexpected/duplicate ZIP entry: $name" }
            $seen[$name] = $true
            $totalSize += $entry.Length
            if ($entry.Length -gt 5242880 -or $totalSize -gt 20971520) { throw 'ZIP entries too large.' }
            $destination = Join-Path $stage $name
            $src = $entry.Open()
            try {
                $dst = [System.IO.File]::Create($destination)
                try { $src.CopyTo($dst) } finally { $dst.Dispose() }
            } finally { $src.Dispose() }
        }
        foreach ($name in $AllowedFiles) { if (!$seen.ContainsKey($name)) { throw "ZIP is missing $name" } }
    } finally { $archive.Dispose() }
    $newManifest = VerifyManifest (Join-Path $stage 'manifest.json')
    if ((ParseVersion ([string]$newManifest.version)) -ne $latestVersion) { throw 'Manifest does not match GitHub release tag.' }
    if ($newManifest.permissions -notcontains 'alarms') { throw 'Extension package lacks the expected update-reload permission.' }

    if (!(Test-Path -LiteralPath $target)) { New-Item -ItemType Directory -Path $target -Force | Out-Null }
    $backup = Join-Path $temp 'backup'
    New-Item -ItemType Directory -Path $backup -Force | Out-Null
    $previous = @{}
    foreach ($name in $AllowedFiles) {
        $oldPath = Join-Path $target $name
        if (Test-Path -LiteralPath $oldPath -PathType Leaf) {
            Copy-Item -LiteralPath $oldPath -Destination (Join-Path $backup $name) -Force
            $previous[$name] = $true
        }
    }
    $markerPath = Join-Path $target 'update-status.json'
    if (Test-Path -LiteralPath $markerPath -PathType Leaf) {
        Copy-Item -LiteralPath $markerPath -Destination (Join-Path $backup 'update-status.json') -Force
        $previous['update-status.json'] = $true
    }
    try {
        foreach ($name in $AllowedFiles) {
            Copy-Item -LiteralPath (Join-Path $stage $name) -Destination (Join-Path $target $name) -Force
        }
        [void](VerifyManifest (Join-Path $target 'manifest.json'))
        # Marker is written only after a successful, validated installation.
        $marker = @{source='github-release-windows-updater';version=$latest;installedAt=[DateTime]::UtcNow.ToString('o');sha256=$digest} | ConvertTo-Json -Compress
        SaveUtf8 $markerPath $marker
    } catch {
        foreach ($name in @($AllowedFiles)+@('update-status.json')) {
            $dest = Join-Path $target $name
            if ($previous.ContainsKey($name)) { Copy-Item -LiteralPath (Join-Path $backup $name) -Destination $dest -Force }
            elseif (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Force }
        }
        throw
    }
    Log "Installed v$latest at $target. Chrome reloads automatically once the editor is closed (after v1.4 first load)."
} catch {
    Log ('Update failed: ' + $_.Exception.Message)
    exit 1
} finally {
    if ($temp -and (Test-Path -LiteralPath $temp)) { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
    if ($mutex) { try { $mutex.ReleaseMutex() } catch {}; $mutex.Dispose() }
}
