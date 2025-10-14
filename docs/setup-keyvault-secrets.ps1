# Emergency Security Fix - Setup Key Vault Secrets
# This script helps move hardcoded database passwords to Azure Key Vault

param(
    [Parameter(Mandatory=$true)]
    [string]$KeyVaultName = "helix-keys",
    
    [Parameter(Mandatory=$true)]
    [string]$NewSqlPassword,
    
    [Parameter(Mandatory=$true)]
    [string]$NewInstructionsPassword
)

Write-Host "🚨 EMERGENCY SECURITY FIX - Setting up Key Vault secrets" -ForegroundColor Red
Write-Host "=======================================================" -ForegroundColor Red

# Check if user is logged into Azure
try {
    $context = Get-AzContext
    if (-not $context) {
        Write-Host "❌ Not logged into Azure. Please run: Connect-AzAccount" -ForegroundColor Red
        exit 1
    }
    Write-Host "✅ Logged into Azure as: $($context.Account.Id)" -ForegroundColor Green
} catch {
    Write-Host "❌ Azure PowerShell module not found. Please install: Install-Module -Name Az" -ForegroundColor Red
    exit 1
}

# Production Environment Secrets
Write-Host "`n🔐 Setting up PRODUCTION secrets..." -ForegroundColor Yellow

$prodSqlConnectionString = "Server=tcp:helix-database-server.database.windows.net,1433;Initial Catalog=helix-core-data;Persist Security Info=False;User ID=helix-database-server;Password=$NewSqlPassword;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;"
$prodInstructionsConnectionString = "Server=tcp:instructions.database.windows.net,1433;Initial Catalog=instructions;Persist Security Info=False;User ID=instructionsadmin;Password=$NewInstructionsPassword;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;"

try {
    Set-AzKeyVaultSecret -VaultName $KeyVaultName -Name "sql-connection-string" -SecretValue (ConvertTo-SecureString -String $prodSqlConnectionString -AsPlainText -Force)
    Write-Host "✅ Set sql-connection-string in Key Vault" -ForegroundColor Green
    
    Set-AzKeyVaultSecret -VaultName $KeyVaultName -Name "instructions-sql-connection-string" -SecretValue (ConvertTo-SecureString -String $prodInstructionsConnectionString -AsPlainText -Force)
    Write-Host "✅ Set instructions-sql-connection-string in Key Vault" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to set production secrets: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Staging Environment Secrets
Write-Host "`n🔐 Setting up STAGING secrets..." -ForegroundColor Yellow

try {
    Set-AzKeyVaultSecret -VaultName $KeyVaultName -Name "sql-connection-string-staging" -SecretValue (ConvertTo-SecureString -String $prodSqlConnectionString -AsPlainText -Force)
    Write-Host "✅ Set sql-connection-string-staging in Key Vault" -ForegroundColor Green
    
    Set-AzKeyVaultSecret -VaultName $KeyVaultName -Name "instructions-sql-connection-string-staging" -SecretValue (ConvertTo-SecureString -String $prodInstructionsConnectionString -AsPlainText -Force)
    Write-Host "✅ Set instructions-sql-connection-string-staging in Key Vault" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to set staging secrets: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host "`n✅ SUCCESS: All secrets have been moved to Key Vault!" -ForegroundColor Green
Write-Host "🔄 Next steps:" -ForegroundColor Cyan
Write-Host "  1. Deploy the updated app settings to Azure" -ForegroundColor White
Write-Host "  2. Verify applications can connect using Key Vault references" -ForegroundColor White
Write-Host "  3. Rotate the old exposed passwords in the database server" -ForegroundColor White
Write-Host "  4. Remove this script after use" -ForegroundColor White
Write-Host "`n⚠️  IMPORTANT: The old passwords are still active in the database!" -ForegroundColor Yellow
Write-Host "   You MUST rotate them in SQL Server after testing the new setup." -ForegroundColor Yellow

# Example usage
Write-Host "`n📋 Example usage:" -ForegroundColor Cyan
Write-Host ".\setup-keyvault-secrets.ps1 -NewSqlPassword 'YOUR_NEW_SECURE_PASSWORD' -NewInstructionsPassword 'YOUR_NEW_INSTRUCTIONS_PASSWORD'" -ForegroundColor White