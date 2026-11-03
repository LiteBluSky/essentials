# Registers a Windows Scheduled Task that runs scripts/start.ps1 hidden at
# logon of the current user, then starts it right away. Re-running replaces
# the existing task. Undo with uninstall-startup.ps1.

param([string]$TaskName = 'Essentials')

$ErrorActionPreference = 'Stop'

$startScript = Join-Path $PSScriptRoot 'start.ps1'
$user = "$env:USERDOMAIN\$env:USERNAME"

# `conhost --headless` runs the console with no window at all. Plain
# `powershell -WindowStyle Hidden` isn't enough: when Windows Terminal is the
# default terminal it shows a window anyway, and closing it kills the server.
$action = New-ScheduledTaskAction `
  -Execute 'conhost.exe' `
  -Argument "--headless powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$startScript`"" `
  -WorkingDirectory (Split-Path -Parent $PSScriptRoot)

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -MultipleInstances IgnoreNew

$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Stop-ScheduledTask -TaskName $TaskName
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
& (Join-Path $PSScriptRoot 'stop.ps1')

Register-ScheduledTask -TaskName $TaskName `
  -Description 'Local Essentials app (bookmarks, notes) on http://localhost:8008' `
  -Action $action -Trigger $trigger -Settings $settings -Principal $principal |
  Out-Null

Start-ScheduledTask -TaskName $TaskName
Write-Host "Registered and started scheduled task '$TaskName' -> http://localhost:8008"
