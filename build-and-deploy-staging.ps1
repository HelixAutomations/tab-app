$ErrorActionPreference = 'Stop'

$zipPath   = Join-Path $PSScriptRoot 'build-staging.zip'
$copyPath  = Join-Path $PSScriptRoot 'last-deploy-staging.zip'
$cfgPath   = Join-Path $PSScriptRoot 'server\web.config'
$deployDir = Join-Path $PSScriptRoot 'deploy-staging'

Write-Host "🚀 STAGING DEPLOYMENT - Building and deploying to staging slot"
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
npm ci --prefix server --only=prod

Write-Host "Copying server dependencies to deploy directory"
Copy-Item -Path "server\node_modules" -Destination "$deployDir\node_modules" -Recurse -Force

Write-Host "Copying server files to deploy directory"
Copy-Item -Path "server\package.json" -Destination "$deployDir\package.json" -Force
Copy-Item -Path "server\package-lock.json" -Destination "$deployDir\package-lock.json" -Force
Copy-Item -Path "server\server.js" -Destination "$deployDir\server.js" -Force
Copy-Item -Path "server\routes" -Destination "$deployDir\routes" -Recurse -Force
Copy-Item -Path "server\middleware" -Destination "$deployDir\middleware" -Recurse -Force
Copy-Item -Path "server\utils" -Destination "$deployDir\utils" -Recurse -Force
Copy-Item -Path "server\web.config" -Destination "$deployDir\web.config" -Force

Write-Host "Creating IISNode log directory"
New-Item -ItemType Directory -Path "$deployDir\iisnode" -Force | Out-Null

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

Write-Host "Zipping files for staging deploy"
Compress-Archive -Path (Join-Path $deployDir '*') -DestinationPath $zipPath -Force

Write-Host "Copying deployment zip for inspection"
Copy-Item -Path $zipPath -Destination $copyPath -Force

Write-Host "🎯 Deploying to Azure staging slot"
az webapp deploy --resource-group Main --name link-hub-v1 --slot staging --src-path $zipPath


Write-Host "Cleaning up"
Remove-Item -Recurse -Force $deployDir
Remove-Item -Force $zipPath

Write-Host "✅ Staging deployment complete!"
Write-Host "🌐 Staging URL: https://link-hub-v1-staging.azurewebsites.net"
