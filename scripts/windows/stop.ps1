<#
.SYNOPSIS
  Stops the BettingValue servers listening on the API and web ports (default 8000 and 3000).
  Only processes bound to those ports are stopped.
#>
[CmdletBinding()]
param([int[]]$Ports = @(8000, 3000))

. (Join-Path $PSScriptRoot 'common.ps1')

foreach ($port in $Ports) {
    $owners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique)
    if ($owners.Count -eq 0) { Write-Ok "Nothing listening on port $port"; continue }
    foreach ($procId in $owners) {
        $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
        if ($p) {
            Stop-Process -Id $procId -Force
            Write-Ok "Stopped $($p.ProcessName) (pid $procId) on port $port"
        }
    }
}
