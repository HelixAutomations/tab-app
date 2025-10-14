# Azure App Service Configuration Reference

## Environment: link-hub-v1 (Main Resource Group)

### Key Configuration Settings

**Database Connection Strings:**
- `SQL_CONNECTION_STRING` - Main database connection
- `INSTRUCTIONS_SQL_CONNECTION_STRING` - Instructions database connection

**SQL Pool Settings:**
- `SQL_POOL_MAX=50`
- `SQL_POOL_MIN=5` 
- `SQL_POOL_IDLE_TIMEOUT_MS=60000`
- `SQL_CONNECTION_TIMEOUT_MS=600000`
- `SQL_REQUEST_TIMEOUT_MS=600000`

**Application Insights:**
- `APPLICATIONINSIGHTS_CONNECTION_STRING` - App insights telemetry
- `ApplicationInsightsAgent_EXTENSION_VERSION=~2`

**Runtime Settings:**
- `WEBSITE_NODE_DEFAULT_VERSION=~20`
- `WEBSITE_HTTPLOGGING_RETENTION_DAYS=3`
- `XDT_MicrosoftApplicationInsights_Mode=default`
- `XDT_MicrosoftApplicationInsights_NodeJS=1`

### Security Notes

- **Database passwords**: Stored securely in Azure App Service environment variables
- **Local development**: Uses `.env` file (gitignored)
- **Key Vault**: Available at `https://helix-keys.vault.azure.net/` for additional secrets

### Deployment Slots

- **Production**: `link-hub-v1` (default slot)
- **Staging**: `link-hub-v1/staging` slot

Both environments use the same configuration structure but may point to different databases or Key Vault secrets as needed.

### Management Commands

```bash
# View current settings
az webapp config appsettings list --name link-hub-v1 --resource-group Main

# View staging slot settings  
az webapp config appsettings list --name link-hub-v1 --slot staging --resource-group Main

# Set individual setting (example)
az webapp config appsettings set --name link-hub-v1 --resource-group Main --settings SETTING_NAME="value"
```

---
*Configuration reference created during security cleanup - October 2025*