# Environment Configuration Setup

## Quick Start for New Developers

When setting up this project in a new environment:

### 1. Copy Environment Files
```bash
# Copy the example files
cp .env.example .env
cp .env.example .env

# Edit with your actual values
code .env
code .env
```

### 2. Required Configuration

**Database Credentials:**
- Replace `YOUR_PASSWORD` with actual database passwords
- Replace `your-database-server` with actual server names
- Replace `your-username` with actual usernames

**Azure Function Codes:**
- Replace all `YOUR_FUNCTION_CODE_HERE` with actual function access codes
- Get these from Azure Portal → Function App → Functions → Get Function URL

**API Credentials:**
- Replace `your-api-token-here` with actual API tokens
- Replace Clio credentials with your actual values
- Replace `YOUR_INITIALS` with your actual initials

**Azure Resources:**
- Replace `your-keyvault` with actual Key Vault name
- Replace `your-tenant-id` with actual Azure tenant ID
- Replace placeholder URLs with actual resource URLs

### 3. Files Included

- **`.env.example`** - Main environment template (comprehensive)
- **`.env.example`** - Local development template
- **`.env.email-v2`** - Email V2 feature flags (ready to use)

### 4. Security Notes

- ✅ **Example files are safe** - No real secrets, can be committed to git
- ❌ **Real .env files** - Never commit `.env` to git
- 🔒 **Secrets in production** - Use Azure App Service environment variables

### 5. Local Development

The actual `.env` file is automatically excluded from git via `.gitignore`. This ensures your local development credentials stay secure.

---
*Environment setup guide created during security cleanup - October 2025*