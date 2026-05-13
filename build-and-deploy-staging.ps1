$ErrorActionPreference = 'Stop'

$zipPath   = Join-Path $PSScriptRoot 'build-staging.zip'
$copyPath  = Join-Path $PSScriptRoot 'last-deploy-staging.zip'
$deployDir = Join-Path $PSScriptRoot 'deploy-staging'

function Test-StagingDeployFailure {
    param(
        [string[]]$OutputLines,
        [int]$ExitCode
    )

    if ($ExitCode -ne 0) {
        return $true
    }

    $joined = ($OutputLines -join "`n")
    return $joined -match 'An error occurred during deployment' -or $joined -match 'Status Code:\s*500'
}

Write-Host "🚀 STAGING DEPLOYMENT - Building and deploying to staging slot"
Write-Host "Removing existing zip artifacts"
Remove-Item -Path $zipPath, $copyPath -Force -ErrorAction SilentlyContinue

# Prepare a clean deployment staging directory
Write-Host "Preparing deployment staging directory"
Remove-Item -Recurse -Force $deployDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $deployDir | Out-Null


Write-Host "Building frontend (root directory)"
# Wipe any stale build output so a partial/failed build can't slip through.
Remove-Item -Recurse -Force "$PSScriptRoot\build" -ErrorAction SilentlyContinue
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: 'npm run build' failed with exit code $LASTEXITCODE."
    exit 1
}

# Verify the build actually produced a usable SPA bundle (index.html + static/).
$indexHtml = Join-Path $PSScriptRoot 'build\index.html'
$staticDir = Join-Path $PSScriptRoot 'build\static'
if (-not (Test-Path $indexHtml) -or -not (Test-Path $staticDir)) {
    Write-Host "ERROR: Build output incomplete - missing build/index.html or build/static/."
    Write-Host "       This usually means craco build failed silently. Aborting deploy."
    exit 1
}
Write-Host "Frontend build verified (index.html + static/ present)."
Write-Host "Copying build output to deploy directory"
Copy-Item -Path "$PSScriptRoot\build\*" -Destination "$deployDir" -Recurse -Force

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

Write-Host "Copying server files to deploy directory"
Copy-Item -Path "server\package.json" -Destination "$deployDir\package.json" -Force
Copy-Item -Path "server\package-lock.json" -Destination "$deployDir\package-lock.json" -Force
# Use index.js as production entry point (single source of truth for routes + middleware).
# IISNode expects server.js — copy index.js under that name.
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

Write-Host "Creating IISNode log directory"
New-Item -ItemType Directory -Path "$deployDir\iisnode" -Force | Out-Null

# Include shared merge field schema required by CCL routes
$schemaDir = Join-Path $deployDir 'src\app\functionality'
New-Item -ItemType Directory -Path $schemaDir -Force | Out-Null
Copy-Item -Path "src\app\functionality\cclSchema.js" -Destination $schemaDir -Force

# Include canonical CCL template source required by server-side DOCX generation
$cclTemplateSrc = Join-Path $PSScriptRoot 'src\tabs\instructions\templates\cclTemplate.ts'
if (Test-Path $cclTemplateSrc) {
    $cclTemplateDest = Join-Path $deployDir 'src\tabs\instructions\templates'
    New-Item -ItemType Directory -Path $cclTemplateDest -Force | Out-Null
    Copy-Item -Path $cclTemplateSrc -Destination (Join-Path $cclTemplateDest 'cclTemplate.ts') -Force
}

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

Write-Host "Zipping files for staging deploy"
Compress-Archive -Path (Join-Path $deployDir '*') -DestinationPath $zipPath -Force

Write-Host "Copying deployment zip for inspection"
Copy-Item -Path $zipPath -Destination $copyPath -Force

Write-Host "🎯 Deploying to Azure staging slot"
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
    $rawDeployOutput = & az webapp deploy --resource-group Main --name link-hub-v1 --slot staging --src-path $zipPath --async true 2>&1
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

if (Test-StagingDeployFailure -OutputLines $deployOutput -ExitCode $deployExitCode) {
    Write-Host "ERROR: Azure staging deployment did not complete successfully."
    Write-Host "       Keeping deployment artifacts for inspection:"
    Write-Host "       - $copyPath"
    Write-Host "       - $deployDir"
    exit 1
}


Write-Host "Cleaning up"
Remove-Item -Recurse -Force $deployDir
Remove-Item -Force $zipPath

Write-Host "✅ Staging deployment complete!"
Write-Host "🌐 Staging URL: https://link-hub-v1-staging.azurewebsites.net"
