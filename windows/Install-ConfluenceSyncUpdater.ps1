# One-time installation, for Windows PowerShell 5.1+.
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File .\windows\Install-ConfluenceSyncUpdater.ps1 -ExtensionPath 'D:\Tools\ConfluenceSync'
[CmdletBinding()]
param([string]$ExtensionPath = "$env:LOCALAPPDATA\ConfluenceMarkdownSync\extension", [switch]$NoTask)
$ErrorActionPreference='Stop'
$repo='Laity000/confluence-markdown-sync'
$path=[System.IO.Path]::GetFullPath($ExtensionPath)
if (![System.IO.Path]::IsPathRooted($ExtensionPath)) { throw 'Use an absolute -ExtensionPath.' }
if ([System.IO.Path]::GetPathRoot($path).TrimEnd('\') -eq $path.TrimEnd('\')) { throw 'Refusing to install in a drive root.' }
$state=Join-Path $env:LOCALAPPDATA 'ConfluenceMarkdownSync\updater'
if ($path -eq $state -or $state.StartsWith($path.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Extension path overlaps the updater.' }
New-Item -Path $state -ItemType Directory -Force | Out-Null
$script=Join-Path $state 'Update-ConfluenceSync.ps1'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'Update-ConfluenceSync.ps1') -Destination $script -Force
$config=@{repository=$repo;extensionPath=$path} | ConvertTo-Json -Compress
[System.IO.File]::WriteAllText((Join-Path $state 'config.json'),$config,(New-Object System.Text.UTF8Encoding($false)))
Write-Host "Updater installed at $state"
Write-Host "Extension path: $path"
# Validate and install the first package BEFORE registering the periodic task.
# This prevents a failed first install from leaving a recurring failing task behind.
& $script
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
    throw 'The initial release download failed. Check updater.log and the GitHub release status.'
}
if (!$NoTask) {
    $identity=[System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $action=New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -WindowStyle Hidden -File "'+$script+'"')
    $logon=New-ScheduledTaskTrigger -AtLogOn -User $identity
    $hourly=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(2) -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 3650)
    $principal=New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
    $settings=New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 8) -StartWhenAvailable -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName 'ConfluenceMarkdownSync-AutoUpdate' -Action $action -Trigger @($logon,$hourly) -Principal $principal -Settings $settings -Force | Out-Null
    Write-Host 'Scheduled Task configured: at logon and every hour (current Windows user only).'
} else { Write-Host 'No scheduled task created (-NoTask was set).' }
Write-Host "FIRST TIME: open chrome://extensions -> Developer mode -> Load unpacked -> $path"
Write-Host 'If upgrading an existing v1.3 installation, reload it manually ONCE after installation.'
