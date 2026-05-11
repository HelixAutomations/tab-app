param(
    [switch]$ConfirmedByChat,
    [string]$ConfirmationPhrase,
    [string]$Passcode
)

$ErrorActionPreference = 'Stop'

# --- Production deploy guard (two layers) ---
# Layer 1: explicit chat confirmation phrase.
# Layer 2: SHA256-hashed passcode supplied by the operator. The literal
# passcode is intentionally not stored in source — only its hash. The
# operator (and only the operator) knows the value; agents must ask for
# it in chat each time and pass it through to -Passcode.
$requiredConfirmationPhrase = 'DEPLOY PROD'
$expectedPasscodeHash = '5f11428eb9009b8f4338f5d0b11d0322117d72a0a37b9da435ec7eb646b8bec4'

function Test-ProdDeployAuthorized {
    param([string]$Phrase, [string]$Code, [bool]$Confirmed)
    if (-not $Confirmed) { return $false }
    if ($Phrase -ne $requiredConfirmationPhrase) { return $false }
    if ([string]::IsNullOrWhiteSpace($Code)) { return $false }
    $hash = [System.BitConverter]::ToString(
        [System.Security.Cryptography.SHA256]::Create().ComputeHash(
            [System.Text.Encoding]::UTF8.GetBytes($Code)
        )
    ).Replace('-','').ToLower()
    return ($hash -eq $expectedPasscodeHash)
}

if (-not (Test-ProdDeployAuthorized -Phrase $ConfirmationPhrase -Code $Passcode -Confirmed:$ConfirmedByChat)) {
    Write-Host ""
    Write-Host "ERROR: Production deploy guard blocked this run." -ForegroundColor Red
    Write-Host "       Production deploys require ALL of the following:"
    Write-Host "         1) -ConfirmedByChat switch"
    Write-Host "         2) -ConfirmationPhrase 'DEPLOY PROD'"
    Write-Host "         3) -Passcode <operator passcode>  (the agent must NOT guess this;"
    Write-Host "            it must be supplied by the human operator in chat)"
    Write-Host ""
    Write-Host "       If you are an agent: stop. Ask the operator in chat to confirm the"
    Write-Host "       prod deploy AND to type the passcode. Only then re-run with all three"
    Write-Host "       arguments. Never hard-code, cache, or re-use the passcode across runs."
    Write-Host ""
    exit 1
}

Write-Host "Production deploy guard satisfied. Proceeding." -ForegroundColor Green

$zipPath   = Join-Path $PSScriptRoot 'build.zip'
$copyPath  = Join-Path $PSScriptRoot 'last-deploy.zip'
$deployDir = Join-Path $PSScriptRoot 'deploy'

Write-Host "Removing existing zip artifacts"
Remove-Item -Path $zipPath, $copyPath -Force -ErrorAction SilentlyContinue

# Prepare a clean deployment staging directory
Write-Host "Preparing deployment staging directory"
Remove-Item -Recurse -Force $deployDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $deployDir | Out-Null


Write-Host "Building frontend (root directory)"
npm run build

# Ensure frontend build output is in root build/ directory if needed
if (Test-Path "$PSScriptRoot\build") {
    Write-Host "Frontend build output found in root build/ directory."
    Write-Host "Copying build output to deploy directory"
    Copy-Item -Path "$PSScriptRoot\build\*" -Destination "$deployDir" -Recurse -Force
} else {
    Write-Host "ERROR: No build output found in root build/ directory after build."
    exit 1
}

Write-Host "Installing server dependencies (production only)"
if (Test-Path "server\node_modules") {
    Write-Host "Removing existing server node_modules before clean install"
    Remove-Item -LiteralPath "server\node_modules" -Recurse -Force
}
npm ci --prefix server --omit=dev --no-audit --fund=false --progress=false
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Server dependency install failed."
    exit $LASTEXITCODE
}

Write-Host "Copying server dependencies to deploy directory"
Copy-Item -Path "server\node_modules" -Destination "$deployDir\node_modules" -Recurse -Force

Write-Host "Creating IISNode log directory"
New-Item -ItemType Directory -Path "$deployDir\iisnode" -Force | Out-Null



# Copy server files to deploy directory for Azure compatibility
# Use index.js as production entry point (single source of truth for routes + middleware).
# IISNode expects server.js — copy index.js under that name.
Copy-Item -Path "server\package.json" -Destination "$deployDir\package.json" -Force
Copy-Item -Path "server\package-lock.json" -Destination "$deployDir\package-lock.json" -Force
Copy-Item -Path "server\index.js" -Destination "$deployDir\server.js" -Force
Copy-Item -Path "server\routes" -Destination "$deployDir\routes" -Recurse -Force
Copy-Item -Path "server\middleware" -Destination "$deployDir\middleware" -Recurse -Force
Copy-Item -Path "server\utils" -Destination "$deployDir\utils" -Recurse -Force
Copy-Item -Path "server\operatorActions" -Destination "$deployDir\operatorActions" -Recurse -Force
Copy-Item -Path "server\activity-card-lab" -Destination "$deployDir\activity-card-lab" -Recurse -Force
Copy-Item -Path "server\web.config" -Destination "$deployDir\web.config" -Force
if (Test-Path "server\prompts") {
    Copy-Item -Path "server\prompts" -Destination "$deployDir\prompts" -Recurse -Force
}

# Repo-tracked JSON state used by server routes (demo cheat sheet access + LZ overrides,
# roadmap whiteboard, etc.). Routes read from <deployDir>\data, so ship the folder verbatim.
if (Test-Path "data") {
    Write-Host "Copying data directory (demo notes overrides, roadmap whiteboard, etc.)"
    $deployDataDir = Join-Path $deployDir 'data'
    New-Item -ItemType Directory -Path $deployDataDir -Force | Out-Null
    Copy-Item -Path "data\*" -Destination $deployDataDir -Recurse -Force
}

$requiredDeployAssets = @(
    'server.js',
    'routes\dev-console.js',
    'operatorActions\registry.js'
)
foreach ($asset in $requiredDeployAssets) {
    if (-not (Test-Path (Join-Path $deployDir $asset))) {
        Write-Host "ERROR: Deployment artifact missing required server asset: $asset"
        exit 1
    }
}

# Include shared merge field schema required by CCL routes
$schemaDir = Join-Path $deployDir 'src\app\functionality'
New-Item -ItemType Directory -Path $schemaDir -Force | Out-Null
Copy-Item -Path "src\app\functionality\cclSchema.js" -Destination $schemaDir -Force

# Include per-user email signatures for Pitch Builder (server-side injection)
$sigSrc = Join-Path $PSScriptRoot 'src\assets\signatures'
if (Test-Path $sigSrc) {
    $sigDest = Join-Path $deployDir 'assets\signatures'
    New-Item -ItemType Directory -Path $sigDest -Force | Out-Null
    Copy-Item -Path "$sigSrc\*" -Destination $sigDest -Recurse -Force
}

# Include changelog for the Activity tab release-notes surface.
$changelogSrc = Join-Path $PSScriptRoot 'logs\changelog.md'
if (Test-Path $changelogSrc) {
    $logsDest = Join-Path $deployDir 'logs'
    New-Item -ItemType Directory -Path $logsDest -Force | Out-Null
    Copy-Item -Path $changelogSrc -Destination (Join-Path $logsDest 'changelog.md') -Force
}

Write-Host "Zipping files for deploy"
Compress-Archive -Path (Join-Path $deployDir '*') -DestinationPath $zipPath -Force

Write-Host "Copying deployment zip for inspection"
Copy-Item -Path $zipPath -Destination $copyPath -Force

Write-Host "Deploying to Azure"
$hadNativeCommandPreference = Test-Path variable:PSNativeCommandUseErrorActionPreference
if ($hadNativeCommandPreference) {
    $previousNativeCommandPreference = $PSNativeCommandUseErrorActionPreference
    $PSNativeCommandUseErrorActionPreference = $false
}
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'

try {
    # Use async handoff so Azure can finish extracting and starting the app
    # without the CLI waiting long enough to hit a false timeout.
    $rawDeployOutput = & az webapp deploy --resource-group Main --name link-hub-v1 --src-path $zipPath --async true 2>&1
    $deployExitCode = $LASTEXITCODE
    $deployOutput = @($rawDeployOutput | ForEach-Object {
        if ($_ -is [System.Management.Automation.ErrorRecord]) { $_.ToString() } else { [string]$_ }
    })
}
finally {
    $ErrorActionPreference = $previousErrorActionPreference
    if ($hadNativeCommandPreference) {
        $PSNativeCommandUseErrorActionPreference = $previousNativeCommandPreference
    }
}

$deployOutput | ForEach-Object { Write-Host $_ }

if ($deployExitCode -ne 0) {
    Write-Host "ERROR: Azure deployment did not complete successfully."
    exit $deployExitCode
}



Write-Host "Cleaning up"
Remove-Item -Recurse -Force $deployDir
Remove-Item -Force $zipPath

Write-Host "✅ Done"
