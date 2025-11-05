# Google Ads API Setup Guide

## Overview
Your Google Ads endpoint is ready at `/api/marketing-metrics/google-ads`, but it needs proper credentials configured. Since your Google Ads account was approved, follow these steps to set up the API integration.

## Required Credentials

Add these values to your `.env` file (placeholders already added):

```bash
GOOGLE_ADS_DEVELOPER_TOKEN=your_developer_token_here
GOOGLE_ADS_CLIENT_ID=your_client_id_here
GOOGLE_ADS_CLIENT_SECRET=your_client_secret_here
GOOGLE_ADS_REFRESH_TOKEN=your_refresh_token_here
GOOGLE_ADS_LOGIN_CUSTOMER_ID=your_manager_account_id_here
GOOGLE_ADS_CUSTOMER_ID=your_customer_account_id_here
```

## Step-by-Step Setup

### 1. Get Developer Token
1. Go to [Google Ads API Developer Center](https://developers.google.com/google-ads/api/docs/first-call/dev-token)
2. Sign in with your Google Ads account
3. Navigate to **Tools & Settings** → **API Center** → **Google Ads API**
4. Apply for a developer token (may take 24-48 hours for approval)
5. Copy the developer token to `GOOGLE_ADS_DEVELOPER_TOKEN`

### 2. Create OAuth2 Credentials
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the **Google Ads API**
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client IDs**
5. Choose **Desktop application** type
6. Copy the Client ID to `GOOGLE_ADS_CLIENT_ID`
7. Copy the Client Secret to `GOOGLE_ADS_CLIENT_SECRET`

### 3. Generate Refresh Token
You'll need to authorize your application and get a refresh token. Use this OAuth2 playground:

1. Go to [Google OAuth2 Playground](https://developers.google.com/oauthplayground/)
2. Click the gear icon (⚙️) and check "Use your own OAuth credentials"
3. Enter your Client ID and Client Secret
4. In **Step 1**: Add scope `https://www.googleapis.com/auth/adwords`
5. Click **Authorize APIs** and sign in with your Google Ads account
6. In **Step 2**: Click **Exchange authorization code for tokens**
7. Copy the `refresh_token` to `GOOGLE_ADS_REFRESH_TOKEN`

### 4. Get Customer IDs
1. Sign in to [Google Ads](https://ads.google.com/)
2. Your **Customer ID** is shown in the top right (format: 123-456-7890)
3. Remove dashes for `GOOGLE_ADS_CUSTOMER_ID` (e.g., 1234567890)
4. If you have a manager account, use that ID for `GOOGLE_ADS_LOGIN_CUSTOMER_ID`
5. If no manager account, use the same ID for both

## Testing the Setup

Once you've added all credentials to `.env`, restart your development server and test:

```bash
# Test the endpoint
curl "http://localhost:3000/api/marketing-metrics/google-ads?daysBack=7"
```

Or using PowerShell:
```powershell
Invoke-RestMethod -Uri "http://localhost:3000/api/marketing-metrics/google-ads?daysBack=7" -Method GET
```

## Expected Response Format

Successful response:
```json
{
  "success": true,
  "data": [
    {
      "date": "2024-01-15",
      "impressions": 1250,
      "clicks": 45,
      "cost": 23.50,
      "conversions": 2
    }
  ],
  "dateRange": {
    "start": "2024-01-08",
    "end": "2024-01-15"
  }
}
```

## Troubleshooting

### Common Issues:
1. **"Missing Google Ads configuration"** - One or more env vars are empty
2. **"Failed to obtain access token"** - Invalid refresh token or OAuth credentials
3. **"Customer not found"** - Wrong customer ID format (should be numbers only)
4. **"Developer token not approved"** - Wait for Google approval or check API Center

### Debug Steps:
1. Verify all env vars are set (no empty values)
2. Check customer ID format (numbers only, no dashes)
3. Ensure your Google Ads account has active campaigns
4. Verify OAuth2 credentials are for the correct Google Cloud project

## Security Notes

- Never commit actual credentials to Git
- In production, use Azure Key Vault instead of env vars
- The refresh token doesn't expire but can be revoked
- Developer token is tied to your Google Ads account

## Alternative: Key Vault Setup (Production)

For production, you can store credentials in Azure Key Vault using these secret names:
- `google-ads-developer-token`
- `google-ads-client-id`
- `google-ads-client-secret`
- `google-ads-refresh-token`
- `google-ads-login-customer-id`
- `google-ads-customer-id`

Then set these env vars to reference the secrets:
```bash
GOOGLE_ADS_DEVELOPER_TOKEN_SECRET=google-ads-developer-token
GOOGLE_ADS_CLIENT_ID_SECRET=google-ads-client-id
# ... etc
```