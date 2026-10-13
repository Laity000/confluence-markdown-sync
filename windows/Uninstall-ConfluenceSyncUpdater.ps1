[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
Unregister-ScheduledTask -TaskName 'ConfluenceMarkdownSync-AutoUpdate' -Confirm:$false -ErrorAction SilentlyContinue
Write-Host 'Scheduled auto-update disabled. Existing extension files and configuration were left untouched.'
