# Azure Credentials Architecture Mapping

**Last Updated**: November 1, 2025

## Overview
This document provides a complete mapping of Azure app registrations and their associated credentials stored in the `helix-keys` Key Vault. This clarifies which credentials are duplicates, which are expired, and which should be used for different services.

## App Registration Architecture

### 🔹 App Registration #1: "aidenteams" (Microsoft Graph API Services)
**Purpose**: Microsoft Graph API access for email, OneDrive, calendar, and other M365 services

**App Registration ID**: `bee758ec-919c-45b2-9cdf-540c6419561f`

**Key Vault Secret Names for App ID**:
- ✅ `graph-aidenteams-clientid` → `bee758ec-919c-45b2-9cdf-540c6419561f`
- ✅ `aiden-app-id` → `bee758ec-919c-45b2-9cdf-540c6419561f` *(duplicate of above)*

**Client Secrets**:
- ❌ `graph-aidenteams-clientsecret` → <redacted> **(EXPIRED)**
- ✅ `aiden-email-secret-value` → <stored in Key Vault> **(ACTIVE)**

**Recommended Credential Pair for Graph API**:
```
App ID: graph-aidenteams-clientid
Secret: aiden-email-secret-value (retrieve from Key Vault at runtime)
```

---

### 🔹 App Registration #2: "enquiry-aiden" (Teams Bot Framework)
**Purpose**: Teams bot functionality for enquiry processing and notifications

**App Registration ID**: `bb3357f0-dca3-4fef-9c4d-e58f69dde46c`

**Key Vault Secret Names for App ID**:
- ✅ `enquiry-aiden-app-id` → `bb3357f0-dca3-4fef-9c4d-e58f69dde46c`

**Client Secrets**:
- ✅ `enquiry-aiden-client-secret` → <stored in Key Vault> **(ACTIVE)**
- ✅ `enquiry-aiden-bot-secret` → <duplicate of above; stored in Key Vault> *(duplicate of above)*

**Recommended Credential Pair for Teams Bot**:
```
App ID: enquiry-aiden-app-id
Secret: enquiry-aiden-client-secret (retrieve from Key Vault at runtime)
```

---

## Usage Patterns in Codebase

### Microsoft Graph API Services
**Files Using Graph Credentials**:
- `server/routes/sendEmail.js` - Email sending via Graph API
- `api/src/functions/postFinancialTask.ts` - OneDrive file operations (currently broken due to missing `financial-attachments-secret`)

**Current Implementation Issues**:
- ⚠️ `postFinancialTask.ts` references non-existent `financial-attachments-secret`
- ⚠️ Mixed credential usage causing authentication failures

**Recommended Fix**:
Update `postFinancialTask.ts` to use working credentials:
```typescript
// Replace missing financial-attachments-secret with:
const clientSecret = await getSecret('aiden-email-secret-value');
const clientId = await getSecret('graph-aidenteams-clientid');
```

### Teams Bot Services
**Files Using Bot Credentials**:
- Teams app manifest and bot framework integrations
- Enquiry processing notifications to Teams channels

---

## Key Insights & Action Items

### ✅ Working Credential Combinations
1. **Graph API Services**: `graph-aidenteams-clientid` + `aiden-email-secret-value`
2. **Teams Bot**: `enquiry-aiden-app-id` + `enquiry-aiden-client-secret`

### ❌ Broken/Missing Credentials
1. **Expired**: `graph-aidenteams-clientsecret` (should be replaced or removed)
2. **Missing**: `financial-attachments-secret` (causing postFinancialTask failures)

### 🔄 Duplicate Secret Names
1. `graph-aidenteams-clientid` = `aiden-app-id` (same value)
2. `enquiry-aiden-client-secret` = `enquiry-aiden-bot-secret` (same value)

### 📋 Recommended Actions
1. **Update `postFinancialTask.ts`** to use working Graph credentials
2. **Remove or update expired** `graph-aidenteams-clientsecret`
3. **Standardize naming** - consider deprecating duplicate secret names
4. **Document permissions** for each app registration in Azure AD

---

## Permissions Analysis

### 🚨 EXTREMELY HIGH PERMISSIONS - Both Apps Are "Beefy"

Both app registrations have extensive, enterprise-level permissions that go far beyond typical application needs.

### 🔹 App Registration #1: "aidenteams" (47 Total Permissions)
**Breakdown**: 28 delegated scopes + 17 application roles + 2 other resource permissions

**Key High-Risk Application Permissions** (without user consent):
- `Directory.ReadWrite.All` - Read/write ALL directory data (users, groups, apps)
- `User.ReadWrite.All` - Read/write ALL user profiles
- `Mail.ReadWrite` + `Mail.Send` - Full email access for ALL users
- `Files.ReadWrite.All` - Read/write ALL OneDrive/SharePoint files
- `Calendars.ReadWrite` - Full calendar access for ALL users
- `RoleManagement.ReadWrite.Directory` - Manage Azure AD roles and permissions
- `UserAuthenticationMethod.ReadWrite.All` - Manage ALL users' auth methods

**Key Delegated Permissions** (with user consent):
- All mail permissions (read, write, send, shared mailboxes)
- All file permissions (OneDrive, SharePoint)
- All calendar permissions
- User profile access

### 🔹 App Registration #2: "enquiry-aiden" (53 Total Permissions!)
**Breakdown**: 23 delegated scopes + 30 application roles

**Key High-Risk Application Permissions** (without user consent):
- `Directory.ReadWrite.All` - Read/write ALL directory data
- `User.ReadWrite.All` - Read/write ALL user profiles  
- `Mail.ReadWrite` + `Mail.Send` - Full email access for ALL users
- `Files.ReadWrite.All` - Read/write ALL OneDrive/SharePoint files
- `TeamsAppInstallation.ReadWriteAndConsentForUser.All` - Install apps for ALL users
- `UserAuthenticationMethod.ReadWrite.All` - Manage ALL users' auth methods
- `RoleManagement.ReadWrite.Directory` - Manage Azure AD roles
- **Plus extensive Teams-specific permissions**

**Additional Teams Bot Permissions**:
- Full Teams app management for all users
- Teams policy assignment and management
- Teams configuration read/write

### ⚠️ Security Implications

1. **Global Admin Equivalent**: Both apps have permissions that effectively grant global admin-level access
2. **No Principle of Least Privilege**: Apps have far more permissions than needed for their stated purposes
3. **High Blast Radius**: Compromise of either app could affect entire organization
4. **Regulatory Risk**: Excessive permissions may violate compliance requirements

### 🎯 Permission Overlap Analysis

**Identical Permissions Between Apps**:
- Directory management (users, groups, roles)
- Full email access (all mailboxes)
- File system access (OneDrive/SharePoint)
- User authentication management
- Basic Graph API access

**enquiry-aiden Additional Permissions**:
- Teams-specific app management
- Teams policy administration
- Teams user configuration

**Conclusion**: The "enquiry-aiden" app has **MORE** permissions than "aidenteams", not fewer. Both are massively over-permissioned.

---

## Security Recommendations

### 🔥 URGENT - Permission Audit Required
1. **Immediate Review**: Conduct permission audit with security team
2. **Principle of Least Privilege**: Reduce permissions to minimum required
3. **Separate Concerns**: Create purpose-specific apps instead of mega-apps
4. **Regular Rotation**: Implement automated secret rotation
5. **Monitoring**: Add alerts for high-privilege app usage

### 💡 Suggested App Architecture
Instead of two mega-apps, consider:
- **Email Service App**: Only Mail.Send, Mail.Read permissions
- **Files Service App**: Only Files.ReadWrite.AppFolder
- **Teams Bot App**: Only Teams bot framework permissions
- **User Management App**: Only specific user read permissions needed

---

## Security Notes
- All secrets are stored in Azure Key Vault `helix-keys`
- **BOTH apps have dangerously broad permissions** - far exceeding normal application needs
- Both apps can effectively act as global administrators
- Secrets should be rotated regularly with high priority given permission scope
- Expired secrets should be removed after confirming no active usage
- **Consider immediate permission reduction** to align with security best practices

---

## For Developers

### Email/Graph API Development
Use this credential pair for any Microsoft Graph operations:
```javascript
const clientId = await getSecret('graph-aidenteams-clientid');
const clientSecret = await getSecret('aiden-email-secret-value');
```

### Teams Bot Development
Use this credential pair for Teams bot operations:
```javascript
const clientId = await getSecret('enquiry-aiden-app-id');
const clientSecret = await getSecret('enquiry-aiden-client-secret');
```

### Testing Credentials (without revealing values)
To verify credential existence and metadata only:
```bash
# Show metadata only (no secret value)
az keyvault secret show --vault-name helix-keys --name graph-aidenteams-clientid --query "id"
az keyvault secret show --vault-name helix-keys --name aiden-email-secret-value --query "attributes.enabled"

az keyvault secret show --vault-name helix-keys --name enquiry-aiden-app-id --query "id"
az keyvault secret show --vault-name helix-keys --name enquiry-aiden-client-secret --query "attributes.enabled"
```

> Security note: Never include plaintext secret values in documentation or commit history. Always reference Key Vault secret names and retrieve values at runtime.