# Stable launcher: checks for a newer core updater, verifies the release package, then runs it.
# The scheduled task should point here, not directly at Update-ConfluenceSync.ps1.
[CmdletBinding()]
param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Repo = 'Laity000/confluence-markdown-sync'
$StateDir = $PSScriptRoot
$ConfigFile = Join-Path $StateDir 'config.json'
$UpdaterPath = Join-Path $StateDir 'Update-ConfluenceSync.ps1'
$LogFile = Join-Path $StateDir 'updater.log'
$InstallerCmd = ([char]0x5B89) + ([char]0x88C5) + 'Windows' + ([char]0x81EA) + ([char]0x52A8) + ([char]0x66F4) + ([char]0x65B0) + '.cmd'
$ExpectedEntries = @(
    'updater-version.txt',
    $InstallerCmd,
    'windows/Install-ConfluenceSyncUpdater.ps1',
    'windows/Update-ConfluenceSync.ps1',
    'windows/Update-ConfluenceSyncBootstrap.ps1',
    'windows/Uninstall-ConfluenceSyncUpdater.ps1',
    'docs/WINDOWS_AUTO_UPDATE.md'
)

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
function ReadUpdaterVersion([string]$path) {
    if (!(Test-Path -LiteralPath $path -PathType Leaf)) { return [version]'0.0.0' }
    $source = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
    $match = [regex]::Match($source, '(?m)^# UpdaterVersion:\s*(\d+(?:\.\d+){2,3})\s*$')
    if (!$match.Success) { return [version]'0.0.0' }
    return ParseVersion $match.Groups[1].Value
}
function SaveUtf8([string]$path,[string]$content) {
    [System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding($false)))
}

if (!(Test-Path -LiteralPath $ConfigFile -PathType Leaf)) {
    throw "Missing $ConfigFile; run Install-ConfluenceSyncUpdater.ps1 once."
}
$config = Get-Content -LiteralPath $ConfigFile -Raw -Encoding UTF8 | ConvertFrom-Json
if ($config.repository -cne $Repo) { throw 'Updater repository does not match the pinned project.' }

$mutex = New-Object System.Threading.Mutex($false, 'Local\ConfluenceMarkdownSyncBootstrap-Laity000')
$ownsMutex = $false
$temp = $null
$selfUpdateFailed = $false
try {
    $ownsMutex = $mutex.WaitOne(0)
    if (!$ownsMutex) {
        Log 'Another updater bootstrap instance is already running; skipped.'
        exit 0
    }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $release = GetJson "https://api.github.com/repos/$Repo/releases/latest"
    $tagMatch = [regex]::Match([string]$release.tag_name, '^v(\d+(?:\.\d+){2,3})$')
    if ($release.draft -or $release.prerelease -or !$tagMatch.Success) {
        throw 'Latest GitHub release is not a stable version.'
    }
    $latest = $tagMatch.Groups[1].Value
    $latestVersion = ParseVersion $latest
    $currentVersion = ReadUpdaterVersion $UpdaterPath

    if ($latestVersion -gt $currentVersion) {
        Log "Updater update available: $currentVersion -> $latest"
        if ($CheckOnly) {
            Log 'CheckOnly: updater files will not be changed.'
        } else {
            $assetName = "confluence-sync-windows-updater-v$latest.zip"
            $asset = @($release.assets | Where-Object { $_.name -ceq $assetName })
            $sumAsset = @($release.assets | Where-Object { $_.name -ceq 'SHA256SUMS.txt' })
            if ($asset.Count -ne 1 -or $sumAsset.Count -ne 1) { throw 'Required updater ZIP or SHA256SUMS.txt asset was not found.' }
            foreach ($a in @($asset[0],$sumAsset[0])) {
                if ([string]$a.browser_download_url -notlike "https://github.com/$Repo/releases/download/*") {
                    throw 'Unexpected updater release asset host or path.'
                }
            }
            if ($asset[0].size -gt 2097152) { throw 'Updater ZIP is unexpectedly large.' }

            $temp = Join-Path $env:TEMP ('ConfluenceSyncUpdater-' + [Guid]::NewGuid().ToString('N'))
            New-Item -ItemType Directory -Path $temp -Force | Out-Null
            $zipPath = Join-Path $temp 'updater.zip'
            $sumPath = Join-Path $temp 'SHA256SUMS.txt'
            Invoke-WebRequest -Uri $asset[0].browser_download_url -OutFile $zipPath -Headers @{'User-Agent'='ConfluenceMarkdownSyncUpdater'} -TimeoutSec 90
            Invoke-WebRequest -Uri $sumAsset[0].browser_download_url -OutFile $sumPath -Headers @{'User-Agent'='ConfluenceMarkdownSyncUpdater'} -TimeoutSec 45

            $sumText = [System.IO.File]::ReadAllText($sumPath)
            $sumRegex = '(?im)^([0-9a-f]{64})\s+\*?' + [regex]::Escape($assetName) + '\s*$'
            $hashMatch = [regex]::Match($sumText, $sumRegex)
            if (!$hashMatch.Success) { throw 'Release checksum file does not contain the expected updater ZIP hash.' }
            $digest = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($digest -ne $hashMatch.Groups[1].Value.ToLowerInvariant()) { throw 'Updater ZIP SHA256 does not match release checksum.' }
            if ($asset[0].digest -and [string]$asset[0].digest -cne ('sha256:' + $digest)) { throw 'Updater ZIP does not match GitHub asset digest.' }
            Log "Verified updater ZIP SHA256 $digest"

            Add-Type -AssemblyName System.IO.Compression
            Add-Type -AssemblyName System.IO.Compression.FileSystem
            $archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
            $stagedUpdater = Join-Path $temp 'Update-ConfluenceSync.ps1'
            try {
                $entries = @($archive.Entries)
                if ($entries.Count -ne $ExpectedEntries.Count) { throw 'Unexpected file count in updater ZIP.' }
                $seen = @{}
                $totalSize = 0L
                foreach ($entry in $entries) {
                    $name = [string]$entry.FullName
                    if ($ExpectedEntries -cnotcontains $name -or $seen.ContainsKey($name)) { throw "Unexpected/duplicate updater ZIP entry: $name" }
                    $seen[$name] = $true
                    $totalSize += $entry.Length
                    if ($entry.Length -gt 1048576 -or $totalSize -gt 5242880) { throw 'Updater ZIP entries are unexpectedly large.' }
                }
                foreach ($name in $ExpectedEntries) { if (!$seen.ContainsKey($name)) { throw "Updater ZIP is missing $name" } }

                $versionEntry = @($archive.Entries | Where-Object { $_.FullName -ceq 'updater-version.txt' })[0]
                $versionStream = $versionEntry.Open()
                try {
                    $reader = New-Object System.IO.StreamReader($versionStream, [System.Text.Encoding]::UTF8, $true)
                    try { $packageVersionText = $reader.ReadToEnd().Trim() } finally { $reader.Dispose() }
                } finally { $versionStream.Dispose() }
                if ((ParseVersion $packageVersionText) -ne $latestVersion) { throw 'Updater ZIP version marker does not match the latest release tag.' }

                $scriptEntry = @($archive.Entries | Where-Object { $_.FullName -ceq 'windows/Update-ConfluenceSync.ps1' })[0]
                [System.IO.Compression.ZipFileExtensions]::ExtractToFile($scriptEntry, $stagedUpdater, $true)
            } finally {
                $archive.Dispose()
            }
            if ((ReadUpdaterVersion $stagedUpdater) -ne $latestVersion) { throw 'Packaged updater script version does not match the release.' }

            $backupUpdater = Join-Path $temp 'Update-ConfluenceSync.previous.ps1'
            if (Test-Path -LiteralPath $UpdaterPath -PathType Leaf) {
                Copy-Item -LiteralPath $UpdaterPath -Destination $backupUpdater -Force
            }
            try {
                Copy-Item -LiteralPath $stagedUpdater -Destination $UpdaterPath -Force
                if ((ReadUpdaterVersion $UpdaterPath) -ne $latestVersion) { throw 'Installed updater failed post-copy version validation.' }
            } catch {
                if (Test-Path -LiteralPath $backupUpdater -PathType Leaf) {
                    Copy-Item -LiteralPath $backupUpdater -Destination $UpdaterPath -Force
                }
                throw
            }
            Log "Updated core updater to v$latest."
        }
    } elseif ($latestVersion -lt $currentVersion) {
        Log "Installed updater v$currentVersion is newer than latest release v$latest; refusing downgrade."
    } else {
        Log "Core updater is current: v$currentVersion."
    }
} catch {
    $selfUpdateFailed = $true
    Log ('Updater self-update check failed: ' + $_.Exception.Message)
} finally {
    if ($temp -and (Test-Path -LiteralPath $temp)) { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
    if ($ownsMutex) { try { $mutex.ReleaseMutex() } catch {} }
    if ($mutex) { $mutex.Dispose() }
}

if (!(Test-Path -LiteralPath $UpdaterPath -PathType Leaf)) {
    throw 'Core updater is missing; run Install-ConfluenceSyncUpdater.ps1 again.'
}
$powerShellExe = Join-Path $PSHOME 'powershell.exe'
$arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "' + $UpdaterPath + '"'
if ($CheckOnly) { $arguments += ' -CheckOnly' }
$process = Start-Process -FilePath $powerShellExe -ArgumentList $arguments -Wait -PassThru -WindowStyle Hidden
if ($process.ExitCode -ne 0) { exit $process.ExitCode }
if ($selfUpdateFailed) {
    Log 'The extension check completed, but updater self-update had an error. See updater.log; it will retry on the next scheduled run.'
}
exit 0
