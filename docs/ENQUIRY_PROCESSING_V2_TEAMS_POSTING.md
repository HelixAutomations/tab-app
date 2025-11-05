# Enquiry Processing v2 - Teams Posting Functionality

> **Reference**: `submodules/enquiry-processing-v2` (branch: `facebook-lead-processing`)
>
> **Last Updated**: October 31, 2025

## Overview

The Enquiry Processing v2 submodule is a production-ready ASP.NET Core (.NET 8) service that handles the complete lifecycle of enquiry submissions: ingestion, card generation, Teams posting, and activity tracking. This document provides a comprehensive reference for its Teams posting capabilities.

## Architecture

### Service Stack
- **Platform**: ASP.NET Core (.NET 8) on Azure App Service
- **Database**: Azure SQL (instructions database)
- **Teams Integration**: Microsoft Bot Framework + Graph API fallback
- **Contact Management**: ActiveCampaign sync
- **Document Storage**: Azure Storage (instructionfiles/prospect-files)

### Core Workflow
```
1. CTA Submission → API Controller
2. Determine Traffic Source (paid/organic)
3. Sync to ActiveCampaign → Get AC Contact ID
4. Save to SQL (instructions.enquiries)
5. Generate Adaptive Card from Template
6. Post to Teams via Bot Framework
7. Track Activity (instructions.TeamsBotActivityTracking)
8. Send Success Alert to Logs Channel
```

## Teams Posting Services

### 1. BotMessageService (`Services/BotMessageService.cs`)

Primary service for posting to Teams using Microsoft Bot Framework.

#### Interface: `IBotMessageService`

```csharp
public interface IBotMessageService
{
    Task<PostCardResult> PostAdaptiveCardToTeamsAsync(
        string channelId, 
        object adaptiveCard, 
        string? summary = null, 
        CancellationToken ct = default);
    
    Task<PostCardResult> PostAdaptiveCardToTeamsAsync(
        string teamId, 
        string channelId, 
        object adaptiveCard, 
        string? summary = null, 
        CancellationToken ct = default);
    
    Task<PostCardResult> UpdateAdaptiveCardInTeamsAsync(
        string channelId, 
        string activityId, 
        object adaptiveCard, 
        string? summary = null, 
        CancellationToken ct = default);
    
    Task<FetchActivityResult> FetchActivityAsync(
        string channelId, 
        string activityId, 
        CancellationToken ct = default);
}
```

#### Key Features

**Authentication**
- Bot Framework OAuth2 with client credentials flow
- Token endpoint: `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token`
- Scope: `https://api.botframework.com/.default`
- Cached tokens (expires - 5min buffer)
- Bot password retrieved from Azure Key Vault

**Smart API Selection**
```csharp
// Automatically detects message format and routes accordingly
if (activityId.StartsWith("0:") && long.TryParse(activityId.Substring(2), out _))
{
    // Teams message ID format → Use Graph API
    return await UpdateActivityViaGraphAsync(...);
}
else
{
    // Bot Framework activity ID → Use Bot Connector API
    return await UpdateActivityViaBotFrameworkAsync(...);
}
```

**Team Detection**
```csharp
// Determines correct team based on channel ID prefix
const string LEGACY_TEAM_ID = "b7d73ffb-70b5-45d6-9940-8f9cc7762135";  // Old Helix Law
const string NEW_ENQUIRIES_TEAM_ID = "efdd21c5-5c58-4988-bd3f-88ceb00b6b25";  // New Enquiries

// Legacy channels (old Helix Law team)
19:09c0d3669cd2464aab7db60520dd9180  // legacy commercial
19:2ba7d5a50540426da60196c3b2daf8e8  // legacy construction
19:9e1c8918bca747f5afc9ca5acbd89683  // legacy employment
19:6d09477d15d548a6b56f88c59b674da6  // legacy property
19:b50026477f054abeae7f8035274f7e2e  // api-tests
```

**Error Handling & Resilience**
- Proactive bot installation attempts (`TryProactiveInstallAsync`)
- Automatic token refresh on JWT failures
- Retry on 403 BotNotInConversationRoster errors
- Graceful Graph API fallback when Bot Framework fails

**Bot Connector API**
```
POST https://smba.trafficmanager.net/apis/v3/conversations/{channelId}/activities
PUT  https://smba.trafficmanager.net/apis/v3/conversations/{channelId}/activities/{activityId}
GET  https://smba.trafficmanager.net/apis/v3/conversations/{channelId}/activities/{activityId}
```

**Graph API Fallback**
```
GET   https://graph.microsoft.com/v1.0/teams/{teamId}/channels/{channelId}/messages/{messageId}
PATCH https://graph.microsoft.com/v1.0/teams/{teamId}/channels/{channelId}/messages/{messageId}
```

### 2. TeamsMessageService (`Services/TeamsMessageService.cs`)

Simpler alternative using Graph API directly.

#### Interface: `ITeamsMessageService`

```csharp
public interface ITeamsMessageService
{
    Task<PostMessageResult> PostSimpleHtmlMessageAsync(
        string teamId, 
        string channelId, 
        string html, 
        CancellationToken ct = default);
    
    Task<PostMessageResult> PostAdaptiveCardAsync(
        string teamId, 
        string channelId, 
        object card, 
        string? summary = null, 
        CancellationToken ct = default);
}
```

#### Features
- Direct Graph API integration (no Bot Framework dependency)
- Simple retry logic (3 attempts with exponential backoff)
- Handles 429 (rate limiting) and 5xx errors
- Serializes card to JSON string (Graph API requirement)
- Returns message ID from response

**Graph API Endpoint**
```
POST https://graph.microsoft.com/v1.0/teams/{teamId}/channels/{channelId}/messages
```

**Payload Structure**
```json
{
  "body": {
    "contentType": "html",
    "content": "<attachment id=\"{guid}\"></attachment>"
  },
  "attachments": [{
    "id": "{guid}",
    "contentType": "application/vnd.microsoft.card.adaptive",
    "content": "{serialized-card-json}"
  }]
}
```

## Card Generation System

### Template Architecture

**Template Locations** (`assets/` directory):
- `commercial-card-template.json` - Commercial disputes
- `property-card-template.json` - Property matters
- `employment-card-template.json` - Employment issues
- `construction-card-template.json` - Construction disputes

**Template Selection Logic**:
```csharp
private string GetCardTemplatePath(string? areaOfWork)
{
    var templateName = areaOfWork?.ToLowerInvariant() switch
    {
        "commercial" => "commercial-card-template.json",
        "property" => "property-card-template.json",
        "employment" => "employment-card-template.json",
        "construction" => "construction-card-template.json",
        _ => "commercial-card-template.json"  // Default
    };
    return Path.Combine("assets", templateName);
}
```

### Card Population Process

#### 1. `PopulateCardTemplate` - Basic Field Population
- Updates header: `NEW ENQUIRY — {FirstName} {LastName}`
- Adds document badge: `🗎 {documentCount}` (if documents exist)
- Overwrites **Notes** section (no template defaults)
- Overwrites **Value** section (accurate prospect data)
- Updates hidden Contact Details section
- Updates hidden Form Details section (EnquiryId, AC Contact ID, Source)
- Updates Claim action with enquiry ID

#### 2. `ModernizeCardTemplate` - Advanced Features

**Optional Q&A Sections** (only shown when populated):
```csharp
// These sections appear ONLY if data is provided
- "Which best describes you?" → BestDescribesYou (list)
- "Urgent assistance required?" → UrgentAssistance (string)
- "Topic of interest" → TopicOfInterest (string)
- "Area of law" → AreaOfLaw (string)
```

**Question Pruning Logic**:
- Removes generic template questions (e.g., "Additional Information")
- Retains only populated, specific questions
- Ensures clean card without empty sections

**Documents Section** (`AppendDocumentsSection`):
```csharp
// Appends clickable document links at the end of card body
var container = new JObject
{
    ["type"] = "Container",
    ["separator"] = true,
    ["spacing"] = "Medium",
    ["items"] = new JArray
    {
        new JObject { ["type"] = "TextBlock", ["text"] = "Documents", ["weight"] = "Bolder" },
        new JObject { 
            ["type"] = "TextBlock", 
            ["text"] = string.Join("\n\n", links),  // Markdown links
            ["wrap"] = true 
        }
    }
};
// Links format: • [invoice-1234.pdf](https://files.example.com/i/1234.pdf)
```

#### 3. `ApplyPreviewStateToCard` - Preview Transformations

Transforms cards for Enquiry Platform testing:

| Preview State | Visual Changes |
|--------------|----------------|
| `claimed` | Collapsed details, shows claimed status |
| `cantAssist` | Triage styling, collapsed details |
| `lowValue` | Triage styling, indicates low value |
| `out-of-scope` | Triage styling, shows out-of-scope |
| `decline-prospect` | Triage styling, decline indicator |
| `redirected` | Triage styling, shows redirect status |

**Implementation**:
```csharp
private void ApplyPreviewStateToCard(JObject template, string previewState)
{
    // Transform header styling
    var headerText = template.SelectToken("$.body[0]") as JObject;
    if (headerText != null)
    {
        headerText["color"] = previewState == "claimed" ? "Good" : "Attention";
        headerText["text"] = $"{previewState.ToUpper()} — {originalText}";
    }
    
    // Collapse details section
    var detailsContainer = template.SelectToken("$..[?(@.id == 'enquiryDetails')]") as JObject;
    if (detailsContainer != null)
    {
        detailsContainer["isVisible"] = false;
    }
}
```

## Channel Resolution & Routing

### Resolution Priority Order

1. **Dev Override** (Highest Priority)
   ```csharp
   if (channelOverride == "dev") → Use dev channel (always wins)
   ```

2. **Preview State Implies Triage**
   ```csharp
   if (previewState in ["lowvalue", "cantassist", "out-of-scope", 
                        "decline-prospect", "redirected"]) → Triage channel
   ```

3. **Content-Driven Triage** (Commercial Only)
   ```csharp
   // Value-based rule
   if (parsedValue <= threshold) → Triage channel  // Default threshold: £10,000
   
   // Keyword rule
   if (TopicOfInterest || AreaOfLaw || Notes contains "small claim") → Triage channel
   ```

4. **Area-Based Default Channels**
   ```csharp
   areaOfWork switch
   {
       "commercial" => CommercialChannelId,
       "property" => PropertyChannelId,
       "employment" => EmploymentChannelId,
       "construction" => ConstructionChannelId,
       _ => DefaultChannelId
   }
   ```

### Money Parsing Logic

Flexible format support in `TryParseMoney`:

```csharp
// Supported formats:
"£10,000"  → 10000.00m
"10k"      → 10000.00m
"1.2m"     → 1200000.00m
"£8,750"   → 8750.00m
"500"      → 500.00m

// Implementation
var match = Regex.Match(s, @"(?i)£?\s*([\d,.]+)\s*([kKmM]?)");
var numberPart = match.Groups[1].Value.Replace(",", "");
decimal.Parse(numberPart);
// Apply multiplier for k (×1000) or m (×1000000)
```

### Configuration Keys

**Teams Channels** (in `appsettings.json`):
```json
{
  "Teams": {
    "DefaultTeamId": "efdd21c5-5c58-4988-bd3f-88ceb00b6b25",
    "DefaultChannelId": "19:...",
    
    "CommercialChannelId": "19:...",
    "PropertyChannelId": "19:...",
    "EmploymentChannelId": "19:...",
    "ConstructionChannelId": "19:...",
    
    "TriageChannelId": "19:...",
    "CommercialTriageChannelId": "19:...",
    "PropertyTriageChannelId": "19:...",
    "EmploymentTriageChannelId": "19:...",
    "ConstructionTriageChannelId": "19:...",
    
    "LegacyTriageChannelId": "19:...",
    "DevChannelId": "19:..."
  },
  "Triage": {
    "Commercial": {
      "LowValueThreshold": 10000
    }
  }
}
```

**Environment Variables**:
```bash
ENQUIRY_AIDEN_APP_ID=bb3357f0-dca3-4fef-9c4d-e58f69dde46c  # Bot application ID
AIDEN_TENANT_ID=<tenant-guid>                              # Microsoft tenant
AIDEN_KEY_VAULT_URI=https://helix-keys.vault.azure.net/   # Key Vault URI
ENQUIRY_AIDEN_CLIENT_SECRET_NAME=enquiry-aiden-bot-secret # Secret name
TEAMS_GRAPH_BASE=https://graph.microsoft.com/v1.0         # Graph API base URL
INSTRUCTIONS_SQL_CONNECTION=<connection-string>            # Optional SQL override
```

## Activity Tracking

### Database Schema

**Table**: `instructions.TeamsBotActivityTracking`

```sql
CREATE TABLE TeamsBotActivityTracking (
    Id INT IDENTITY(1,1) PRIMARY KEY,
    ActivityId NVARCHAR(255) NOT NULL,           -- Bot Framework activity ID or Teams message ID
    ChannelId NVARCHAR(255) NOT NULL,            -- Teams channel ID
    TeamId NVARCHAR(255) NOT NULL,               -- Teams team ID
    EnquiryId NVARCHAR(50),                      -- Link to enquiries table
    LeadName NVARCHAR(255),                      -- Prospect full name
    Email NVARCHAR(255),                         -- Contact email
    Phone NVARCHAR(50),                          -- Contact phone
    CardType NVARCHAR(50),                       -- Card category
    MessageTimestamp BIGINT,                     -- Unix timestamp
    Stage NVARCHAR(50) DEFAULT 'new',           -- Workflow stage
    Status NVARCHAR(50) DEFAULT 'active',       -- Record status
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 DEFAULT GETUTCDATE()
);
```

**Card Type Values**:
- `commercial_enquiry` - Commercial disputes
- `property_enquiry` - Property matters
- `employment_enquiry` - Employment issues
- `construction_enquiry` - Construction disputes
- `facebook_lead` - Facebook lead capture
- `incoming_call` - Default/fallback type

### Tracking Implementation

```csharp
private async Task TrackEnquiryActivity(
    int enquiryId,
    string activityId,
    string channelId,
    string teamId,
    CreateEnquiryRequest request)
{
    string cardType = request.Endpoint?.ToLowerInvariant() switch
    {
        "commercial" => "commercial_enquiry",
        "property" => "property_enquiry",
        "employment" => "employment_enquiry",
        "construction" => "construction_enquiry",
        "facebook-lead" => "facebook_lead",
        _ => "incoming_call"
    };

    var record = new TeamsBotActivityRecord
    {
        ActivityId = activityId,
        ChannelId = channelId,
        TeamId = teamId,
        EnquiryId = enquiryId.ToString(),
        LeadName = $"{request.FirstName} {request.LastName}",
        Email = request.Email,
        Phone = request.Phone,
        CardType = cardType,
        MessageTimestamp = new DateTimeOffset(DateTime.UtcNow).ToUnixTimeSeconds(),
        Stage = "new",
        Status = "active"
    };

    await _trackingService.StoreActivityAsync(record);
}
```

## API Endpoints

### Primary CTA Endpoints (`Controllers/CtaController.cs`)

#### Commercial Enquiries
```http
POST /api/commercial-maincta
Content-Type: application/json

{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "phone": "+447700900123",
  "value": "£8,750",
  "notes": "I need help with an unpaid invoice.",
  "areaOfWork": "commercial",
  "endpoint": "commercial",
  "formUrl": "https://www.helix-law.com/cta/commercial",
  "source": "enquiry-platform",
  "pointOfContact": "team@helix-law.com",
  
  "bestDescribesYou": ["I am owed money"],
  "urgentAssistance": "Yes",
  "topicOfInterest": "Commercial debt recovery",
  "areaOfLaw": null,
  "adjudicationInterest": null,
  
  "documents": [
    {
      "name": "invoice-1234.pdf",
      "url": "https://files.example.com/i/1234.pdf",
      "size": 248000,
      "contentType": "application/pdf"
    }
  ],
  "documentCount": 1,
  
  "meta": {
    "previewState": "normal"
  },
  "channelOverride": null,
  "legacyFormat": false
}
```

**Response**:
```json
{
  "success": true,
  "enquiryId": 12345,
  "activityId": "1761923778997-k6l6tiso4",
  "channelId": "19:efdd21c5...",
  "teamId": "efdd21c5-5c58-4988-bd3f-88ceb00b6b25"
}
```

### Similar Endpoints
- `POST /api/property-maincta` - Property enquiries
- `POST /api/employment-maincta` - Employment enquiries
- `POST /api/construction-maincta` - Construction enquiries

### Payload Fields

#### Required Fields
- `firstName` (string) - Prospect first name
- `lastName` (string) - Prospect last name
- `email` (string) - Contact email
- `phone` (string) - Contact phone number
- `areaOfWork` (string) - Practice area: `commercial`, `property`, `employment`, `construction`
- `endpoint` (string) - Matching endpoint identifier

#### Optional Fields
- `value` (string) - Estimated dispute value (flexible format)
- `notes` (string) - Additional information from prospect
- `source` (string) - Traffic source identifier
- `pointOfContact` (string) - Helix contact email
- `formUrl` (string) - Source form URL
- `legacyFormat` (boolean) - Use legacy team/channels

#### Optional Q&A Fields (shown only when populated)
- `bestDescribesYou` (string[]) - Prospect situation descriptors
- `urgentAssistance` (string) - Urgency indicator
- `topicOfInterest` (string) - Subject matter
- `areaOfLaw` (string) - Specific legal area
- `adjudicationInterest` (string) - Adjudication enquiry flag

#### Documents
- `documents` (DocumentInfo[]) - Array of document metadata
  - `name` (string) - Display filename
  - `url` (string) - Downloadable URL
  - `size` (number) - File size in bytes
  - `contentType` (string) - MIME type
- `documentCount` (number) - Total document count

#### Testing & Routing
- `meta.previewState` (string) - Preview transformation: `normal`, `claimed`, `cantAssist`, `lowValue`, `out-of-scope`, `decline-prospect`, `redirected`
- `channelOverride` (string) - Force channel routing: `dev`, `triage`, or null

## Usage Examples

### Example 1: Standard Commercial Enquiry

```typescript
const payload = {
  firstName: "John",
  lastName: "Smith",
  email: "john.smith@example.com",
  phone: "+447700900001",
  value: "£25,000",
  notes: "Supplier hasn't paid for goods delivered 3 months ago. We've sent multiple reminders.",
  areaOfWork: "commercial",
  endpoint: "commercial",
  source: "google-ads",
  
  bestDescribesYou: ["I am owed money"],
  urgentAssistance: "No",
  topicOfInterest: "Commercial debt recovery"
};

const response = await fetch('https://enquiry-processing-v2.azurewebsites.net/api/commercial-maincta', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload)
});

// Result: Posts to commercial channel (value above triage threshold)
```

### Example 2: Low-Value Commercial (Triage)

```typescript
const payload = {
  firstName: "Jane",
  lastName: "Doe",
  email: "jane.doe@example.com",
  phone: "+447700900002",
  value: "£3,500",  // Below £10,000 threshold
  notes: "Small business dispute over unpaid invoice.",
  areaOfWork: "commercial",
  endpoint: "commercial"
};

// Result: Routes to commercial triage channel (low value)
```

### Example 3: Small Claims Keyword Detection

```typescript
const payload = {
  firstName: "Bob",
  lastName: "Jones",
  email: "bob.jones@example.com",
  phone: "+447700900003",
  value: "£15,000",  // Above threshold
  notes: "I want to make a small claim against my landlord.",  // Keyword detected
  areaOfWork: "commercial",
  endpoint: "commercial"
};

// Result: Routes to commercial triage channel (keyword match)
```

### Example 4: Preview State Testing

```typescript
const payload = {
  firstName: "Test",
  lastName: "User",
  email: "test@example.com",
  phone: "+447700900004",
  value: "£50,000",
  notes: "This is a preview test.",
  areaOfWork: "commercial",
  endpoint: "commercial",
  
  meta: {
    previewState: "claimed"  // Transform card appearance
  }
};

// Result: Routes to triage, shows claimed card styling
```

### Example 5: With Documents

```typescript
const payload = {
  firstName: "Sarah",
  lastName: "Williams",
  email: "sarah.w@example.com",
  phone: "+447700900005",
  value: "£100,000",
  notes: "Contract dispute with supporting documentation.",
  areaOfWork: "commercial",
  endpoint: "commercial",
  
  documents: [
    {
      name: "Contract_Agreement_2024.pdf",
      url: "https://storage.example.com/docs/contract123.pdf",
      size: 524288,
      contentType: "application/pdf"
    },
    {
      name: "Email_Thread.pdf",
      url: "https://storage.example.com/docs/emails456.pdf",
      size: 156000,
      contentType: "application/pdf"
    }
  ],
  documentCount: 2
};

// Result: Card shows 🗎 2 badge and Documents section with clickable links
```

## Integration with Main Tab App

### Current Integration Status

The Enquiry Processing v2 service is maintained as a **separate submodule** at:
```
submodules/enquiry-processing-v2 (branch: facebook-lead-processing)
```

### Integration Points

1. **Shared Database**: Both systems use `instructions` database
   - Tab app writes to: `Instructions` table, `Matters` table
   - Enquiry v2 writes to: `enquiries` table, `TeamsBotActivityTracking` table

2. **Shared Teams**: Both post to the same Teams channels
   - Tab app uses custom Teams posting logic
   - Enquiry v2 uses Bot Framework/Graph API

3. **Contact Sync**: Both integrate with ActiveCampaign
   - Enquiry v2 syncs on enquiry creation
   - Tab app has separate contact management flows

### Considerations for Integration

**Option 1: Keep Separate (Current)**
- ✅ Independent deployment cycles
- ✅ Specialized for enquiry ingestion
- ✅ Optimized for CTA form processing
- ⚠️ Duplicate Teams posting code
- ⚠️ Different authentication patterns

**Option 2: Extract Shared Library**
```
helix-teams-sdk/
  ├── BotMessageService.cs      // Bot Framework posting
  ├── TeamsMessageService.cs    // Graph API posting
  ├── ChannelResolver.cs        // Smart channel routing
  └── Models/
      ├── PostCardResult.cs
      └── TeamsBotActivityRecord.cs
```
- ✅ Single source of truth for Teams posting
- ✅ Consistent authentication
- ✅ Shared configuration
- ⚠️ Requires NuGet package management
- ⚠️ Coordinated versioning

**Option 3: Integrate into Tab App**
- ✅ Single codebase
- ✅ Shared utilities
- ✅ Unified deployment
- ⚠️ Increased complexity
- ⚠️ Mixing React frontend with .NET backend concerns

**Recommendation**: Keep separate for now, consider extracting shared library if Teams posting patterns stabilize across projects.

## Troubleshooting

### Common Issues

#### 1. Bot Not in Conversation Roster
```
Error: BotNotInConversationRoster
Status: 403
```

**Solution**: Bot needs to be manually added to Teams channel
1. Open Teams channel
2. Add "Enquiry Aiden" bot as a member
3. Retry the operation (automatic retry included in service)

#### 2. Invalid JWT Token
```
Error: Invalid JWT
Status: 401
```

**Solution**: Token refresh issue
- Service automatically retries with fresh token
- Check Key Vault access for bot password
- Verify `AIDEN_TENANT_ID` environment variable

#### 3. ConversationNotFound
```
Error: ConversationNotFound
Status: 404
```

**Solution**: Invalid channel ID or placeholder
- Verify channel ID from Teams URL
- Ensure channel still exists
- Check team/channel ID mapping in configuration

#### 4. Graph API Fallback Failures
```
Error: Graph API returned 404
```

**Solution**: Incorrect team ID for channel
- Verify channel belongs to specified team
- Use LEGACY_TEAM_ID for old Helix Law channels
- Use NEW_ENQUIRIES_TEAM_ID for new channels

### Debugging Tools

#### Enable Verbose Logging
```json
{
  "Logging": {
    "LogLevel": {
      "enquiry_processing_v2.Services.BotMessageService": "Debug",
      "enquiry_processing_v2.Services.EnquiryService": "Debug"
    }
  }
}
```

#### Test Endpoints

**Health Check**:
```http
GET /api/diagnostic/health
```

**Test Card Posting** (if available):
```http
POST /api/diagnostic/test-card
Content-Type: application/json

{
  "channelId": "19:...",
  "teamId": "efdd21c5-...",
  "message": "Test card"
}
```

#### SQL Queries for Tracking

```sql
-- Recent enquiries posted to Teams
SELECT TOP 20 
    e.Id as EnquiryId,
    e.FirstName + ' ' + e.LastName as ProspectName,
    e.Email,
    e.AreaOfWork,
    t.ActivityId,
    t.ChannelId,
    t.CardType,
    t.Stage,
    t.CreatedAt
FROM instructions.enquiries e
INNER JOIN instructions.TeamsBotActivityTracking t ON e.Id = CAST(t.EnquiryId AS INT)
ORDER BY e.CreatedAt DESC;

-- Failed activity tracking (no ActivityId)
SELECT TOP 20 *
FROM instructions.enquiries
WHERE Id NOT IN (
    SELECT CAST(EnquiryId AS INT)
    FROM instructions.TeamsBotActivityTracking
    WHERE EnquiryId IS NOT NULL
)
ORDER BY CreatedAt DESC;
```

## Best Practices

### 1. Error Handling
- Always check `PostCardResult.Success` before assuming successful post
- Log `ActivityId` for future card updates
- Handle null `ActivityId` gracefully (retry or alert)

### 2. Channel Configuration
- Use area-specific triage channels when available
- Fallback to global triage channel if area-specific not configured
- Always have dev channel configured for testing

### 3. Document Links
- Use HTTPS URLs only
- Consider SAS tokens for Azure Storage URLs
- Keep filenames descriptive and under 100 characters
- Validate URLs are publicly accessible (or use SAS)

### 4. Money Values
- Accept flexible formats from users
- Parse and normalize for triage logic
- Store original string in database for audit

### 5. Preview States
- Use for testing only
- Never use in production submissions
- Document preview behavior in test plans

### 6. Activity Tracking
- Store ActivityId immediately after successful post
- Track EnquiryId for linking to enquiries table
- Use MessageTimestamp for chronological ordering

## Performance Considerations

### Token Caching
- Bot Framework tokens cached for duration of lifetime
- 5-minute buffer before expiry for refresh
- Key Vault calls minimized (cached bot password)

### Retry Logic
- 3 attempts for Graph API (exponential backoff)
- 1 retry for Bot Framework on specific errors
- No retry on client errors (4xx except 429)

### Database Connection Pooling
- SQL connections managed by Entity Framework Core
- Connection string cached after first Key Vault retrieval
- SemaphoreSlim prevents concurrent Key Vault calls

### Async Operations
- All I/O operations are async
- CancellationToken support throughout
- Fire-and-forget for non-critical alerts

## Security Considerations

### Authentication
- Bot credentials stored in Azure Key Vault
- DefaultAzureCredential for Key Vault access
- Tenant-specific OAuth endpoints
- Token scope restricted to Bot Framework

### Data Handling
- No sensitive data in logs (emails/phones sanitized)
- PII encrypted at rest in SQL database
- TLS 1.2+ for all HTTP communications
- No credentials in configuration files

### Authorization
- Bot requires explicit Teams channel membership
- Graph API uses application permissions
- SQL connection uses managed identity when possible

## Maintenance & Updates

### Updating Card Templates
1. Edit template in `assets/*.json`
2. Test with preview states
3. Deploy to staging environment
4. Validate with test submissions
5. Deploy to production

### Updating Channel IDs
1. Edit `appsettings.json` or environment variables
2. No code changes required
3. Restart app service to apply
4. Verify routing with dev channel override

### Updating Triage Thresholds
```json
{
  "Triage": {
    "Commercial": {
      "LowValueThreshold": 15000  // Changed from 10000
    }
  }
}
```

### Monitoring
- Azure Application Insights for telemetry
- Log Analytics for query-based monitoring
- Alert on failed posts (Status != 200)
- Track average post latency

## Future Enhancements

### Planned Improvements
1. **SAS URL Generation** for documents (Azure Storage)
2. **Card Update API** for status changes (claimed, resolved)
3. **Bulk Operations** for batch enquiry imports
4. **Webhook Support** for real-time card interactions
5. **Roster Caching** for performance optimization

### Under Consideration
1. **Multi-tenant Support** for other law firms
2. **Custom Field Mapping** via configuration
3. **Template Editor UI** for non-developers
4. **A/B Testing** for card variations
5. **Analytics Dashboard** for conversion tracking

## References

### Internal Documentation
- `submodules/enquiry-processing-v2/README.md` - Quick start guide
- `submodules/enquiry-processing-v2/documentation/ENQUIRY-PROCESSING-GUIDE.md` - Detailed system guide
- `submodules/enquiry-processing-v2/RUN_LOCALLY.md` - Local development setup

### External Resources
- [Bot Framework Documentation](https://docs.microsoft.com/en-us/azure/bot-service/)
- [Microsoft Graph API - Teams Messages](https://docs.microsoft.com/en-us/graph/api/channel-post-messages)
- [Adaptive Cards Designer](https://adaptivecards.io/designer/)
- [Adaptive Cards Schema](https://adaptivecards.io/explorer/)

### Team Contacts
- **Primary Maintainer**: Development Team
- **Teams Integration**: IT Infrastructure
- **Database Schema**: Database Admin Team

---

**Document Version**: 1.0  
**Last Updated**: October 31, 2025  
**Submodule Reference**: `enquiry-processing-v2` @ `facebook-lead-processing` branch
