# Shared helpers for the BettingValue Windows scripts. Compatible with Windows PowerShell 5.1 and PowerShell 7.
# Never prints secret values.

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) { Write-Host "`n==> $Message" -ForegroundColor Cyan }
function Write-Ok([string]$Message) { Write-Host "    [OK]   $Message" -ForegroundColor Green }
function Write-Warn2([string]$Message) { Write-Host "    [WARN] $Message" -ForegroundColor Yellow }
function Write-Fail([string]$Message) { Write-Host "    [FAIL] $Message" -ForegroundColor Red }

function Get-RepoRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
}

function Test-IsWindowsHost {
    # $IsWindows does not exist in Windows PowerShell 5.1 (which only runs on Windows).
    if ($PSVersionTable.PSEdition -eq 'Desktop') { return $true }
    return [bool]$IsWindows
}

# ---------------------------------------------------------------------------------------------
# .env files: read keys, add missing keys, and change a key only with a timestamped backup.
# Files are written as UTF-8 without BOM (PowerShell 5.1 Set-Content would write ANSI/UTF-16).
# ---------------------------------------------------------------------------------------------

function Read-EnvLines([string]$Path) {
    if (-not (Test-Path $Path)) { return ,@() }
    return ,@([System.IO.File]::ReadAllLines($Path))
}

function Write-EnvLines([string]$Path, [string[]]$Lines) {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllLines($Path, $Lines, $utf8NoBom)
}

function Get-EnvValue([string]$Path, [string]$Key) {
    foreach ($line in (Read-EnvLines $Path)) {
        if ($line -match "^\s*$([regex]::Escape($Key))\s*=(.*)$") {
            return $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
    return $null
}

function Backup-File([string]$Path) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $backup = "$Path.bak-$stamp"
    Copy-Item -LiteralPath $Path -Destination $backup
    return $backup
}

# Sets KEY=VALUE. Existing non-empty values are kept unless -Replace is given; a replacement first
# creates a backup. Returns 'added', 'replaced', 'kept' or 'unchanged'.
function Set-EnvValue([string]$Path, [string]$Key, [string]$Value, [switch]$Replace) {
    $lines = Read-EnvLines $Path
    $current = Get-EnvValue $Path $Key
    $pattern = "^\s*$([regex]::Escape($Key))\s*="
    if ($null -eq $current) {
        Write-EnvLines $Path ($lines + "$Key=$Value")
        return 'added'
    }
    if ($current -eq $Value) { return 'unchanged' }
    if ($current -ne '' -and -not $Replace) { return 'kept' }
    if ((Test-Path $Path) -and $current -ne '') { [void](Backup-File $Path) }
    $out = foreach ($line in $lines) { if ($line -match $pattern) { "$Key=$Value" } else { $line } }
    Write-EnvLines $Path @($out)
    if ($current -eq '') { return 'added' }
    return 'replaced'
}

function Read-SecretPlain([string]$Prompt) {
    $secure = Read-Host -Prompt $Prompt -AsSecureString
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

# ---------------------------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------------------------

function Update-SessionPath {
    if (-not (Test-IsWindowsHost)) { return }
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machine;$user;$env:USERPROFILE\.local\bin"
}

function Get-ToolVersion([string]$Command, [string[]]$VersionArgs) {
    $cmd = Get-Command $Command -ErrorAction SilentlyContinue
    if (-not $cmd) { return $null }
    try {
        $text = (& $Command @VersionArgs 2>&1 | Out-String)
        if ($text -match '(\d+)\.(\d+)(\.(\d+))?') { return [version]"$($Matches[1]).$($Matches[2]).$(if ($Matches[4]) { $Matches[4] } else { 0 })" }
    } catch { return $null }
    return $null
}

function Install-WithWinget([string]$Id, [string]$Name) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw "winget is not available. Install '$Name' manually, then re-run this script."
    }
    Write-Host "    Installing $Name via winget ($Id)..."
    winget install --id $Id --exact --silent --accept-source-agreements --accept-package-agreements | Out-Host
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335189) {  # -1978335189 = already installed
        throw "winget failed to install $Name (exit $LASTEXITCODE)."
    }
    Update-SessionPath
}

function Invoke-Checked([string]$What, [scriptblock]$Block) {
    & $Block
    if ($LASTEXITCODE -ne 0) { throw "$What failed (exit code $LASTEXITCODE)." }
}
