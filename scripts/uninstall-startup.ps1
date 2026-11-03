# Stops and removes the Scheduled Task created by install-startup.ps1, and
# stops the server it started.

param([string]$TaskName = 'Essentials')

$ErrorActionPreference = 'Stop'

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $TaskName
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Removed scheduled task '$TaskName'."
} else {
  Write-Host "No scheduled task named '$TaskName'."
}

& (Join-Path $PSScriptRoot 'stop.ps1')
