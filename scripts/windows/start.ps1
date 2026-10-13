<#
.SYNOPSIS
  Starts the BettingValue backend (FastAPI :8000) and frontend (Next.js :3000), then verifies the stack.

.DESCRIPTION
  Each server runs in its own window (close the window to stop it, or run stop.ps1). After both answer,
  `python -m app.cli doctor --odds-api` checks the database, every important API endpoint, that the
  dashboard is rendering backend data, and (if configured) The Odds API key. Secrets are never printed.
#>
[CmdletBinding()]
param(
    [int]$ApiPort = 8000,
    [int]$WebPort = 3000,
    [switch]$NoBrowser,
    [int]$TimeoutSeconds = 120
)

. (Join-Path $PSScriptRoot 'common.ps1')

$root = Get-RepoRoot
$backend = Join-Path $root 'backend'

function Test-Url([string]$Url) {
    try {
        $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
        return $r.StatusCode -eq 200
    } catch { return $false }
}

function Wait-Url([string]$Name, [string]$Url) {
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-Url $Url) { Write-Ok "$Name is up ($Url)"; return }
        Start-Sleep -Seconds 2
    }
    throw "$Name did not respond at $Url within $TimeoutSeconds s. Check its window for errors."
}

function Start-ServerWindow([string]$Title, [string]$WorkDir, [string]$Command) {
    # -EncodedCommand (base64 UTF-16LE) avoids every command-line quoting problem, including paths
    # with spaces or apostrophes.
    $escapedDir = $WorkDir.Replace("'", "''")
    $script = "`$Host.UI.RawUI.WindowTitle = '$Title'; Set-Location -LiteralPath '$escapedDir'; $Command"
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
    $shell = (Get-Process -Id $PID).Path  # the PowerShell running this script (powershell.exe or pwsh)
    $arguments = @('-NoExit', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encoded)
    if (Test-IsWindowsHost) {
        Start-Process -FilePath $shell -ArgumentList $arguments | Out-Null  # opens its own window
    } else {
        # Non-Windows is only used to test this script: no window, so log to a temp file.
        $log = Join-Path ([IO.Path]::GetTempPath()) ("bettingvalue-$($Title -replace '\W', '').log")
        Start-Process -FilePath $shell -ArgumentList $arguments -RedirectStandardOutput $log -RedirectStandardError "$log.err" | Out-Null
    }
}

Write-Step 'Backend (FastAPI)'
if (Test-Url "http://localhost:$ApiPort/health") {
    Write-Ok "Already running on port $ApiPort"
} else {
    Start-ServerWindow 'BettingValue API' $backend "uv run uvicorn app.main:app --port $ApiPort"
    Wait-Url 'API' "http://localhost:$ApiPort/health"
}

Write-Step 'Frontend (Next.js production server)'
if (-not (Test-Path (Join-Path $root '.next\BUILD_ID'))) {
    throw 'No production build found. Run scripts\windows\setup.ps1 first (it runs npm run build).'
}
if (Test-Url "http://localhost:$WebPort/login") {
    Write-Ok "Already running on port $WebPort"
} else {
    Start-ServerWindow 'BettingValue Web' $root "npm run start -- --port $WebPort"
    Wait-Url 'Frontend' "http://localhost:$WebPort/login"
}

Write-Step 'Verifying the full stack'
Push-Location $backend
try {
    uv run python -m app.cli doctor --odds-api --api-url "http://localhost:$ApiPort" --frontend-url "http://localhost:$WebPort"
    $doctorExit = $LASTEXITCODE
} finally { Pop-Location }

if ($doctorExit -ne 0) {
    Write-Fail 'Some checks failed (see above). The servers are still running so you can inspect them.'
    exit 1
}

Write-Step 'BettingValue is running'
Write-Host "    Dashboard:  http://localhost:$WebPort/dashboard"
Write-Host "    API docs:   http://localhost:$ApiPort/docs"
if (-not $NoBrowser -and (Test-IsWindowsHost)) { Start-Process "http://localhost:$WebPort/dashboard" }
