<#
.SYNOPSIS
  One-shot, non-destructive setup of BettingValue (Phase 2) on Windows.

.DESCRIPTION
  1. Checks the repository (read-only Git: never touches branches, stash or working files).
  2. Installs missing tools with winget: Python 3.13, uv, Node.js LTS (skip with -SkipInstall).
  3. Creates/updates backend\.env and .env.local, only adding missing keys. Existing values (for example
     API-Football keys) are never removed; a changed line is backed up first. Secrets are never printed.
  4. Installs backend dependencies (uv sync) and runs Alembic migrations (upgrade only, non-destructive).
  5. Loads odds: real data from The Odds API when ODDS_API_KEY is set, otherwise synthetic demo data.
  6. Installs frontend dependencies and builds Next.js in API mode.

.PARAMETER DatabaseUrl
  PostgreSQL connection string (e.g. from Neon). Alternatively set $env:BV_DATABASE_URL, or paste it when
  prompted (input hidden). Only used when backend\.env has no DATABASE_URL or still has the example default.

.PARAMETER Leagues
  The Odds API competition keys to sync when a key is configured (default soccer_epl). Each costs quota.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\windows\setup.ps1
#>
[CmdletBinding()]
param(
    [string]$DatabaseUrl = $env:BV_DATABASE_URL,
    [string]$OddsApiKey = $env:BV_ODDS_API_KEY,
    [string[]]$Leagues = @('soccer_epl'),
    [switch]$SkipInstall,
    [switch]$NoPrompt,
    [switch]$SkipFrontendBuild
)

. (Join-Path $PSScriptRoot 'common.ps1')

$root = Get-RepoRoot
$backend = Join-Path $root 'backend'
$exampleDbUrl = 'postgresql+psycopg://bettingvalue:bettingvalue@localhost:5432/bettingvalue'

# -------------------------------------------------------------------------------------------------
Write-Step "Repository: $root"
Push-Location $root
try {
    $branch = (git rev-parse --abbrev-ref HEAD 2>$null)
    $stashCount = @(git stash list 2>$null).Count
    Write-Ok "Branch '$branch'; $stashCount stash entr$(if ($stashCount -eq 1) {'y'} else {'ies'}) (left untouched)"
    $dirty = @(git status --porcelain 2>$null).Count
    if ($dirty -gt 0) { Write-Warn2 "$dirty uncommitted change(s) in the working tree (left untouched)" }
} finally { Pop-Location }

if (-not (Test-Path (Join-Path $backend 'alembic.ini'))) {
    Write-Fail "backend\ (Phase 2) is not in this checkout."
    Write-Host @"
    This script will not switch branches for you, because that could disturb uncommitted work.
    A safe way to get Phase 2 next to your current work is a separate worktree:
        git fetch origin claude/bettingvalue-phase1-frontend-m2aqeu
        git worktree add ..\BettingValue-phase2 origin/claude/bettingvalue-phase1-frontend-m2aqeu
    then run this script from ..\BettingValue-phase2.
"@
    exit 1
}
Write-Ok 'Phase 2 backend found'

# -------------------------------------------------------------------------------------------------
Write-Step 'Tools'
$py = Get-ToolVersion 'python' @('--version')
if (-not $py -or $py -lt [version]'3.11.0') {
    if ($SkipInstall) { throw "Python 3.11+ required (found: $py)." }
    Install-WithWinget 'Python.Python.3.13' 'Python 3.13'
    $py = Get-ToolVersion 'python' @('--version')
}
Write-Ok "Python $py"

$uv = Get-ToolVersion 'uv' @('--version')
if (-not $uv) {
    if ($SkipInstall) { throw 'uv is required.' }
    Install-WithWinget 'astral-sh.uv' 'uv'
    $uv = Get-ToolVersion 'uv' @('--version')
}
Write-Ok "uv $uv"

$node = Get-ToolVersion 'node' @('--version')
if (-not $node -or $node -lt [version]'20.9.0') {
    if ($SkipInstall) { throw "Node.js 20.9+ required (found: $node)." }
    Install-WithWinget 'OpenJS.NodeJS.LTS' 'Node.js LTS'
    $node = Get-ToolVersion 'node' @('--version')
}
Write-Ok "Node.js $node"

# -------------------------------------------------------------------------------------------------
Write-Step 'Configuration files (secrets are never displayed)'
$envFile = Join-Path $backend '.env'
if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $backend '.env.example') $envFile
    Write-Ok 'Created backend\.env from .env.example'
} else {
    Write-Ok 'backend\.env exists - keeping all existing values'
}

$currentDb = Get-EnvValue $envFile 'DATABASE_URL'
if (-not $currentDb -or $currentDb -eq $exampleDbUrl) {
    if (-not $DatabaseUrl -and -not $NoPrompt) {
        $DatabaseUrl = Read-SecretPlain 'Paste your PostgreSQL/Neon connection string (hidden; Enter = local default)'
    }
    if ($DatabaseUrl) {
        $result = Set-EnvValue $envFile 'DATABASE_URL' $DatabaseUrl -Replace
        Write-Ok "DATABASE_URL $result"
    } else {
        Write-Warn2 'DATABASE_URL left at the local default (localhost:5432, user bettingvalue)'
    }
} else {
    Write-Ok 'DATABASE_URL already configured - kept'
}

$currentKey = Get-EnvValue $envFile 'ODDS_API_KEY'
if (-not $currentKey) {
    if (-not $OddsApiKey -and -not $NoPrompt) {
        $OddsApiKey = Read-SecretPlain 'The Odds API key for real odds (hidden; Enter = skip, demo data only)'
    }
    if ($OddsApiKey) {
        [void](Set-EnvValue $envFile 'ODDS_API_KEY' $OddsApiKey -Replace)
        Write-Ok 'ODDS_API_KEY saved'
    } else {
        Write-Warn2 'ODDS_API_KEY not set - only synthetic demo odds will be loaded'
    }
} else {
    Write-Ok 'ODDS_API_KEY already configured - kept'
}
$hasOddsKey = [bool](Get-EnvValue $envFile 'ODDS_API_KEY')

$frontendEnv = Join-Path $root '.env.local'
foreach ($pair in @(@('DATA_SOURCE', 'api'), @('API_BASE_URL', 'http://localhost:8000'))) {
    $result = Set-EnvValue $frontendEnv $pair[0] $pair[1] -Replace
    if ($result -eq 'replaced') { Write-Warn2 ".env.local $($pair[0]) changed to '$($pair[1])' (backup saved next to the file)" }
    else { Write-Ok ".env.local $($pair[0]) $result" }
}

Push-Location $root
try {
    foreach ($f in @('backend/.env', '.env.local')) {
        git check-ignore -q $f
        if ($LASTEXITCODE -ne 0) { throw "$f is not ignored by Git - refusing to continue to avoid committing secrets." }
    }
    Write-Ok 'backend\.env and .env.local are ignored by Git'
} finally { Pop-Location }

# -------------------------------------------------------------------------------------------------
Write-Step 'Backend dependencies and database'
Push-Location $backend
try {
    Invoke-Checked 'uv sync' { uv sync }
    # Upgrade-only migrations: creates missing tables, never drops data. Fails clearly if the DB is unreachable.
    Invoke-Checked 'alembic upgrade head (check DATABASE_URL and that PostgreSQL is running)' { uv run alembic upgrade head }
    Invoke-Checked 'Database check' { uv run python -m app.cli doctor --no-api --no-frontend }

    Write-Step 'Odds data'
    if ($hasOddsKey) {
        Invoke-Checked 'The Odds API key check' { uv run python -m app.cli doctor --no-api --no-frontend --odds-api }
        Write-Host "    Syncing REAL odds for: $($Leagues -join ', ') (uses API quota)"
        Invoke-Checked 'Real odds sync' { uv run python -m app.cli sync --leagues @Leagues }
    } else {
        Write-Host '    No API key: loading SYNTHETIC demo odds (clearly labelled Demo in the app)'
        Invoke-Checked 'Demo sync' { uv run python -m app.cli sync-demo --history-hours 6 }
    }
} finally { Pop-Location }

# -------------------------------------------------------------------------------------------------
if (-not $SkipFrontendBuild) {
    Write-Step 'Frontend'
    Push-Location $root
    try {
        if (-not (Test-Path (Join-Path $root 'node_modules'))) { Invoke-Checked 'npm ci' { npm ci } }
        else { Write-Ok 'node_modules present' }
        # next build reads .env.local, so pages are built for DATA_SOURCE=api.
        Invoke-Checked 'npm run build' { npm run build }
    } finally { Pop-Location }
}

Write-Step 'Setup complete'
Write-Host '    Start everything with:  powershell -ExecutionPolicy Bypass -File scripts\windows\start.ps1'
