# Instruct-Pitch Submodule: Pending Changes Summary

**Date**: December 15, 2025  
**Target Repository**: `HelixAutomations/instruct-pitch`  
**Target Branch**: `workspace`  
**Purpose**: These changes were made in the helix-hub workspace but need to be committed and pushed from the instruct-pitch repository.

---

## Overview

There are **5 files with modifications** that need to be applied to the `instruct-pitch` repo on the `workspace` branch. These changes add important functionality including CC/BCC email support, payment data fetching, and logging optimizations.

---

## Change 1: CC/BCC Email Support in sendEmail Function

**File**: `decoupled-functions/sendEmail/index.js`  
**Priority**: HIGH  
**Description**: Adds support for CC and BCC recipients in outbound emails via Microsoft Graph API.

### What to Add

After line 30 (after `const fromEmail = ...`), add these new fields:

```javascript
const ccEmails = body.cc_emails; // Optional CC field - can be array or string (comma/semicolon separated)
const bccEmails = body.bcc_emails; // Optional BCC field - can be array or string (comma/semicolon separated)
const bccEmail = body.bcc_email; // Backward compatibility
```

After line 53 (after `const accessToken = tokenResponse.data.access_token;`), add these helper functions:

```javascript
// Normalize a string or array of emails into a flat, de-duplicated array of addresses
const normalizeEmails = (emails) => {
  if (!emails) return [];
  const raw = Array.isArray(emails) ? emails : [emails];
  const splitRegex = /[,;]+/; // split on comma or semicolon
  const flattened = raw
    .flatMap((e) => (typeof e === 'string' ? e.split(splitRegex) : []))
    .map((e) => (e || '').trim())
    .filter((e) => e.length > 0);
  const seen = new Set();
  const unique = [];
  for (const addr of flattened) {
    if (!seen.has(addr)) {
      seen.add(addr);
      unique.push(addr);
    }
  }
  return unique;
};

// Helper to convert array of email strings to Graph recipient objects
const formatRecipients = (emails) => {
  const list = normalizeEmails(emails);
  return list.map((address) => ({ emailAddress: { address } }));
};

const ccRecipients = formatRecipients(ccEmails);
const bccRecipients = formatRecipients([bccEmails, bccEmail].filter(Boolean));
```

In the `messagePayload.message` object, change:

```javascript
// FROM:
from: { emailAddress: { address: fromEmail } }

// TO:
from: { emailAddress: { address: fromEmail } },
...(ccRecipients.length > 0 ? { ccRecipients } : {}),
...(bccRecipients.length > 0 ? { bccRecipients } : {})
```

### Usage After Implementation

```javascript
// Single CC
{ cc_emails: "someone@example.com" }

// Multiple CC (array)
{ cc_emails: ["person1@example.com", "person2@example.com"] }

// Multiple CC (comma-separated string)
{ cc_emails: "person1@example.com, person2@example.com" }

// BCC support
{ bcc_emails: "hidden@example.com" }
{ bcc_email: "hidden@example.com" }  // backward compatible
```

---

## Change 2: Fetch Payment Data in fetchInstructionData

**File**: `decoupled-functions/fetchInstructionData/index.js`  
**Priority**: HIGH  
**Description**: The function now fetches associated payment records for each instruction.

### Location 1: After fetching joint clients (around line 169)

After the block that sets `inst.deal = d;`, add:

```javascript
// Fetch payment data
const paymentRes = await pool.request()
  .input('ref', sql.NVarChar, inst.InstructionRef)
  .query('SELECT * FROM Payments WHERE instruction_ref=@ref ORDER BY created_at DESC');
inst.payments = paymentRes.recordset || [];
```

### Location 2: In single instruction fetch (around line 206)

After the block that sets `instruction.deal = d;`, add:

```javascript
// Fetch payment data
const paymentRes = await pool.request()
  .input('ref', sql.NVarChar, instructionRef)
  .query('SELECT * FROM Payments WHERE instruction_ref=@ref ORDER BY created_at DESC');
instruction.payments = paymentRes.recordset || [];
```

### Why This Matters

The Helix Hub app needs payment data to display compliance status in matter opening emails. Without this, payment verification shows as "—" in notifications.

---

## Change 3: Logging Configuration (decoupled-functions)

**File**: `decoupled-functions/host.json`  
**Priority**: MEDIUM  
**Description**: Reduces noisy Application Insights logging and disables live metrics for cost/performance.

### Full Updated File

```json
{
  "version": "2.0",
  "logging": {
    "logLevel": {
      "default": "Warning",
      "Host.Results": "Error",
      "Function": "Warning"
    },
    "applicationInsights": {
      "samplingSettings": {
        "isEnabled": true,
        "excludedTypes": "Request"
      },
      "enableLiveMetrics": false
    }
  },
  "extensionBundle": {
    "id": "Microsoft.Azure.Functions.ExtensionBundle",
    "version": "[4.*, 5.0.0)"
  }
}
```

---

## Change 4: Logging Configuration (legacy-fetch)

**File**: `legacy-fetch/host.json`  
**Priority**: MEDIUM  
**Description**: Same logging optimizations as decoupled-functions.

### Full Updated File

```json
{
  "version": "2.0",
  "logging": {
    "logLevel": {
      "default": "Warning",
      "Host.Results": "Error",
      "Function": "Warning"
    },
    "applicationInsights": {
      "samplingSettings": {
        "isEnabled": true,
        "excludedTypes": "Request"
      },
      "enableLiveMetrics": false
    }
  },
  "extensionBundle": {
    "id": "Microsoft.Azure.Functions.ExtensionBundle",
    "version": "[4.*, 5.0.0)"
  }
}
```

---

## Change 5: README Documentation Update

**File**: `README.md`  
**Priority**: LOW  
**Description**: Adds section about September 2025 frontend updates.

### Add After the Introduction Paragraph

```markdown
## 🚨 MAJOR FRONTEND UPDATES - September 2025

### UI/UX Overhaul Completed
- **✅ Professional Design**: Card-based interactions with premium styling
- **✅ Simplified Flow**: Clean 2-step checkout (Identity → Payment)
- **✅ Mobile-First**: Responsive design with fluid clamp() scaling
- **✅ Dev Tools**: Floating sidebar for efficient development testing

### New Documentation
- **📋 [Frontend Changes Overview](FRONTEND_CHANGES_SEPT_2025.md)** - Complete update summary
- **⚡ [Quick Start Guide](QUICK_START_FRONTEND.md)** - Fast developer setup
- **🏗️ [CSS Architecture](CSS_ARCHITECTURE.md)** - Design system documentation
```

**Note**: The referenced documentation files (`FRONTEND_CHANGES_SEPT_2025.md`, `QUICK_START_FRONTEND.md`, `CSS_ARCHITECTURE.md`) exist as untracked files and should also be added.

---

## Change 6: Security Fix in Example Config

**File**: `apps/pitch/backend/local-secrets.example.json`  
**Priority**: HIGH (Security)  
**Description**: Removes hardcoded password from example file.

### Change

```json
// FROM:
"DB_PASSWORD": "qG?-hTyfhsWE0,,}uJB,"

// TO:
"DB_PASSWORD": "[SECURE_PASSWORD_FROM_KEY_VAULT]"
```

---

## Untracked Files to Add

These new documentation files should be committed:

1. `CSS_ARCHITECTURE.md`
2. `FRONTEND_CHANGES_SEPT_2025.md`
3. `QUICK_START_FRONTEND.md`

---

## Implementation Checklist

- [ ] (Upstream repo) Checkout `workspace` branch and pull latest (do not run `git pull` inside `submodules/` in helix-hub)
- [ ] Apply Change 1: CC/BCC support in `sendEmail/index.js`
- [ ] Apply Change 2: Payment fetch in `fetchInstructionData/index.js`
- [ ] Apply Change 3: Update `decoupled-functions/host.json`
- [ ] Apply Change 4: Update `legacy-fetch/host.json`
- [ ] Apply Change 5: Update `README.md`
- [ ] Apply Change 6: Fix `local-secrets.example.json`
- [ ] Add new documentation files
- [ ] Delete `temp.txt` if it exists
- [ ] Test locally
- [ ] Commit: `git add . && git commit -m "feat: add CC/BCC email support, payment data fetching, logging optimizations"`
- [ ] Push: `git push origin workspace`

---

## Testing Notes

### sendEmail CC/BCC
Test with POST to the sendEmail function:
```json
{
  "email_contents": "<p>Test email</p>",
  "user_email": "primary@example.com",
  "subject": "CC/BCC Test",
  "cc_emails": "cc1@example.com, cc2@example.com",
  "bcc_emails": ["hidden@example.com"]
}
```

### fetchInstructionData Payments
Verify that instructions returned include a `payments` array:
```javascript
// Response should include:
{
  "InstructionRef": "HLX-12345-67890",
  "payments": [
    { "id": 1, "instruction_ref": "HLX-12345-67890", "payment_status": "succeeded", ... }
  ]
}
```

---

## After Pushing

In this repo, `submodules/` is read-only and used for reference only.

- Do **not** run `git fetch`, `git pull`, `git reset`, or `git submodule update --remote` inside `submodules/`.
- If helix-hub genuinely needs a newer submodule revision, update the submodule pointer deliberately in a dedicated change.

If you only need to *check* whether the submodule is behind, prefer a status check like:

```bash
git -C submodules/instruct-pitch rev-parse HEAD
git ls-remote origin workspace
```
