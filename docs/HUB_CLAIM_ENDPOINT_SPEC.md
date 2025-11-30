# Hub Claim Endpoint Specification

> **Target Platform**: enquiry-processing-v2  
> **Requester**: Helix Hub  
> **Priority**: High  
> **Date**: January 2025

---

## Overview

Hub needs an API endpoint to claim enquiries from the unclaimed enquiries view. Currently, claiming only updates SQL. The platform already has the full claim flow implemented in `AidenBot.HandleClaimAction` - we need to expose this as an API endpoint.

---

## Endpoint Specification

### `POST /api/hub-claim`

Claims an enquiry on behalf of a Hub user. Performs the same operations as the Teams bot's "Claim" button.

#### Authentication

- Header: `x-api-key: <api-key>`
- Key should be stored in Azure Key Vault as `enquiry-platform-api-key`

#### Request

```json
{
    "enquiryId": "12345",
    "userEmail": "john.doe@helix.com",
    "dataSource": "new",
    "source": "hub",
    "timestamp": "2025-01-15T10:30:00.000Z"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `enquiryId` | string | Yes | The enquiry ID (numeric for new, alphanumeric for legacy) |
| `userEmail` | string | Yes | Email of the user claiming the enquiry |
| `dataSource` | string | Yes | `"new"` = instructions DB, `"legacy"` = helix-core-data |
| `source` | string | Yes | Always `"hub"` - identifies request origin |
| `timestamp` | string | No | ISO 8601 timestamp of the request |

**Database Schema Differences:**

| Field | New (instructions DB) | Legacy (helix-core-data) |
|-------|----------------------|--------------------------|
| ID column | `id` (INT) | `ID` (NVARCHAR) |
| POC column | `poc` | `Point_of_Contact` |
| Claim column | `claim` (DATETIME) | N/A |
| Stage column | `stage` | N/A |

#### Success Response (200)

```json
{
    "success": true,
    "message": "Enquiry claimed successfully",
    "enquiryId": "12345",
    "claimedBy": "john.doe@helix.com",
    "operations": {
        "sql": true,
        "activeCampaign": true,
        "teamsCard": true
    }
}
```

#### Error Responses

**400 Bad Request** - Missing required fields:
```json
{
    "success": false,
    "message": "Missing required field: enquiryId"
}
```

**404 Not Found** - Enquiry not found:
```json
{
    "success": false,
    "message": "Enquiry not found",
    "enquiryId": "12345"
}
```

**409 Conflict** - Already claimed:
```json
{
    "success": false,
    "message": "Enquiry already claimed",
    "enquiryId": "12345",
    "claimedBy": "existing.user@helix.com"
}
```

**500 Internal Server Error** - Partial failure:
```json
{
    "success": false,
    "message": "Partial claim failure",
    "enquiryId": "12345",
    "dataSource": "new",
    "operations": {
        "sql": true,
        "activeCampaign": false,
        "teamsCard": false
    },
    "error": "ActiveCampaign API timeout"
}
```

---

## Required Operations

The endpoint must perform these operations (in order). The `dataSource` field determines which database and column names to use.

### 1. SQL Update

**For `dataSource: "new"` (instructions DB):**

```sql
UPDATE enquiries
SET 
    poc = @userEmail,
    claim = GETUTCDATE(),
    stage = 'Follow Up'
WHERE id = @enquiryId  -- id is INT
```

**For `dataSource: "legacy"` (helix-core-data):**

```sql
UPDATE enquiries
SET 
    Point_of_Contact = @userEmail
WHERE ID = @enquiryId  -- ID is NVARCHAR
```

> **Note**: Legacy schema doesn't have `Claim` or `Stage` columns.

### 2. Activity Tracking (`instructions.TeamsBotActivityTracking`)

Call `ActivityTrackingService.UpdateClaimAsync`:

```csharp
await _activityTrackingService.UpdateClaimAsync(
    enquiryId, 
    userEmail,      // claimedBy
    source: "hub",  // distinguish from Teams
    dataSource      // "new" or "legacy"
);
```

This updates the `TeamsBotActivityTracking` table with the claim info.

### 3. ActiveCampaign Update

Update Field 23 (Point of Contact):

```csharp
// Existing code in AidenBot.cs:
var fieldUpdate = new { contact = new { fieldValues = new[] { 
    new { field = "23", value = userEmail } 
}}};

await _httpClient.PutAsJsonAsync(
    $"https://helixlaw.api-us1.com/api/3/contacts/{acContactId}",
    fieldUpdate
);
```

**Note**: This requires looking up the ActiveCampaign contact ID from the enquiry's email.

### 4. Teams Card Transformation (Optional from Hub)

If the enquiry has a Teams card (check `TeamsBotActivityTracking.MessageId`):

- Transform the card from "Claim | Discard" buttons to "Edit | Unclaim" buttons
- Update the card to show "Claimed by {userEmail}"

**Note**: If no Teams card exists (e.g., for web-only enquiries), skip this step and still return success.

---

## Reference Implementation

The existing claim logic is in `AidenBot.cs`:

```csharp
// HandleClaimAction (lines 547-650 approx)
private async Task<AdaptiveCardInvokeResponse> HandleClaimAction(...)
{
    // 1. Lookup enquiry from SQL
    var enquiryId = data.ContainsKey("id") ? data["id"]?.ToString() : null;
    var enquiry = await _enquiryService.GetEnquiryById(enquiryId);
    
    // 2. Update SQL (Point_of_Contact, Claim, Stage)
    await _sqlClient.ExecuteAsync(updateQuery, new { 
        Point_of_Contact = userEmail,
        Claim = "Claimed",
        Stage = "Follow Up",
        ID = enquiryId
    });
    
    // 3. Update activity tracking
    await _activityTrackingService.UpdateClaimAsync(enquiryId, userEmail);
    
    // 4. Update ActiveCampaign field 23
    await UpdateActiveCampaignPOC(enquiry.Email, userEmail);
    
    // 5. Transform Teams card
    return CreateClaimedCardResponse(enquiry, userEmail);
}
```

---

## Environment Configuration

Hub will use these environment variables:

```env
# Platform URL (defaults to production)
ENQUIRY_PLATFORM_BASE_URL=https://enquiry-processing-v2.azurewebsites.net

# API key (or secret name for Key Vault lookup)
ENQUIRY_PLATFORM_API_KEY_SECRET=enquiry-platform-api-key
```

---

## Logging Requirements

Log all claim operations with:

```json
{
    "action": "hub-claim",
    "enquiryId": "12345",
    "userEmail": "***@helix.com",
    "source": "hub",
    "operations": {
        "sql": { "success": true, "durationMs": 45 },
        "activeCampaign": { "success": true, "durationMs": 320 },
        "teamsCard": { "success": true, "durationMs": 180 }
    },
    "totalDurationMs": 545
}
```

---

## Testing Checklist

- [ ] API key authentication works
- [ ] Missing fields return 400
- [ ] Non-existent enquiry returns 404
- [ ] Already-claimed enquiry returns 409 (or re-claims successfully?)
- [ ] SQL update succeeds
- [ ] Activity tracking update succeeds
- [ ] ActiveCampaign update succeeds (handle AC API errors gracefully)
- [ ] Teams card updates if exists (handle missing card gracefully)
- [ ] Partial failures return appropriate response
- [ ] Logging captures all operations

---

## Questions for Platform Team

1. **Re-claim behavior**: If an enquiry is already claimed, should we:
   - Return 409 Conflict?
   - Allow re-claim (update to new user)?
   - Return current claim info?

2. **Teams card without activity tracking**: Some older enquiries may not have `TeamsBotActivityTracking` records. How should we handle these?

3. **ActiveCampaign failures**: If AC update fails but SQL succeeds, should we:
   - Roll back the SQL change?
   - Continue and flag partial success?
   - Retry AC async?

---

## Implementation Timeline

| Phase | Task | Owner |
|-------|------|-------|
| 1 | Create `/api/hub-claim` endpoint | Platform |
| 2 | Add API key to Key Vault | DevOps |
| 3 | Integration testing | Hub + Platform |
| 4 | Production deployment | DevOps |

---

## Hub Implementation (Complete)

Hub changes are ready:

1. **Server Route**: `server/routes/claimEnquiry.js`
   - POST `/api/claimEnquiry`
   - Calls platform's `/api/hub-claim`
   - Handles authentication via Key Vault
   - Accepts `dataSource` to determine target database

2. **Frontend Utility**: `src/utils/claimEnquiry.ts`
   - Updated to use server route
   - Accepts `dataSource: 'new' | 'legacy'` parameter
   - Returns operation success states

3. **Registration**: `server/index.js`
   - Route registered as `/api/claimEnquiry`

4. **Claim Entry Points** (all using the same API):
   - **Unclaimed Card View**: `src/tabs/enquiries/NewUnclaimedEnquiryCard.tsx`
     - Uses `useClaimEnquiry()` hook
     - Reads `enquiry.__sourceType` to determine dataSource
   - **Table View (Individual Row)**: `src/tabs/enquiries/Enquiries.tsx`
     - `renderClaimPromptChip()` function
     - Detects source from `(item).source === 'instructions'`
   - **Table View (Grouped Child Row)**: Same file
     - Uses `childEnquiry.__sourceType === 'new'` check

---

## Contact

For questions about this spec:
- **Hub Team**: [Hub maintainers]
- **Platform Team**: [Platform maintainers]
