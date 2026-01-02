# Clio API Integration Reference

> Last verified: 2025-12-30

## Overview
This document describes the Clio API integration patterns, authentication flow, API constraints, and common operations discovered through implementation and troubleshooting.

---

## API Configuration

**Base URL**: `https://eu.app.clio.com/api/v4`  
**Region**: EU (European instance)  
**Authentication**: OAuth 2.0 with refresh token flow  
**Documentation**: https://docs.clio.com

---

## Authentication Flow

### Per-User Credentials

Clio credentials are stored **per staff member** in Azure Key Vault:

```
Secret Pattern: {initials}-clio-v1-{credential}

Examples:
- BOD-clio-v1-clientid
- BOD-clio-v1-clientsecret  
- BOD-clio-v1-refreshtoken
- RC-clio-v1-clientid
- LZ-clio-v1-refreshtoken
```

**Staff Initials Mapping**: `Instructions.HelixContact` field contains the initials to determine which Clio account to use.

### Token Refresh Flow

```javascript
// Exchange refresh token for access token
const response = await fetch('https://app.clio.com/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: REFRESH_TOKEN
  })
});

const { access_token, refresh_token } = await response.json();

// CRITICAL: Store the new refresh_token back to Key Vault
// Refresh tokens are single-use and rotate on each request
```

**Key Vault Access**: Use `DefaultAzureCredential` from `@azure/identity` package.

---

## Contact (Client) Operations

### Search for Existing Client

**Endpoint**: `GET /api/v4/contacts.json?query={email}`

```javascript
const response = await fetch(
  `https://eu.app.clio.com/api/v4/contacts.json?query=${encodeURIComponent(email)}`,
  {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  }
);

const { data } = await response.json();
// data is array of contacts matching search
```

**Search Behavior**:
- Case-insensitive email matching
- Returns exact and partial matches
- Empty array if no matches

### Create New Client

**Endpoint**: `POST /api/v4/contacts.json`

#### Person Type (Individual)

```javascript
{
  "data": {
    "type": "Person",
    "first_name": "John",           // REQUIRED for Person
    "last_name": "Smith",            // REQUIRED for Person
    "primary_email_address": "john@example.com",
    "phone_numbers": [
      {
        "name": "Work",              // MUST be: Work, Home, Billing, or Other
        "number": "+44 20 1234 5678",
        "default_number": true
      }
    ],
    "addresses": [
      {
        "name": "Home",              // MUST be: Work, Home, Billing, or Other
        "street": "123 Main Street",
        "city": "London",
        "province": "Greater London",
        "postal_code": "SW1A 1AA",
        "country": "United Kingdom"
      }
    ]
  }
}
```

#### Company Type

```javascript
{
  "data": {
    "type": "Company",
    "name": "Acme Corporation Ltd",  // REQUIRED for Company (use 'name', not first_name/last_name)
    "primary_email_address": "info@acme.com",
    "phone_numbers": [...],          // Same structure as Person
    "addresses": [...]               // Same structure as Person
  }
}
```

**Critical Constraints**:

1. **Type-Specific Fields**:
   - `Person`: MUST have `first_name` and `last_name` (NOT `name`)
   - `Company`: MUST have `name` (NOT `first_name`/`last_name`)
   - Sending wrong fields returns: `"Invalid attributes present for a Person: name"`

2. **Enum Field Values**:
   - `phone_numbers[].name`: Must be `Work`, `Home`, `Billing`, or `Other`
   - `addresses[].name`: Must be `Work`, `Home`, `Billing`, or `Other`
   - Incorrect values return: `"name must be one of Work, Home, Billing, or Other"`

3. **Response Format**:
   ```javascript
   {
     "data": {
       "id": 20134504,  // Use this as ClientId
       "first_name": "John",
       "last_name": "Smith",
       // ... other fields
     }
   }
   ```

---

## Matter Operations

### Create New Matter

**Endpoint**: `POST /api/v4/matters.json`

```javascript
{
  "data": {
    "client": {
      "id": 20134504  // Clio Contact ID from Instructions.ClientId
    },
    "description": "Contract Dispute - [Instruction HLX-27887-30406]",
    "status": "Open",
    "open_date": "2025-09-20",
    "practice_area": {
      "id": 123456  // Optional: Clio Practice Area ID
    },
    "billable": true,
    "billing_method": "hourly"
  }
}
```

**Response Format**:
```javascript
{
  "data": {
    "id": 12651064,          // Use this as MatterId
    "display_number": "SCOTT10803-00001",  // Clio matter number
    "description": "Contract Dispute - [Instruction HLX-27887-30406]",
    "client": {
      "id": 20134504,
      "name": "Scott Group Renewables Uk Ltd"
    },
    "status": "Open",
    // ... other fields
  }
}
```

**Display Number Pattern**: `{CLIENT_PREFIX}{CLIO_USER_ID}-{MATTER_SEQUENCE}`
- Example: `SCOTT10803-00001` = Scott client, User 10803, 1st matter

---

## Error Handling

### Common Error Responses

```javascript
// Invalid attributes
{
  "error": {
    "type": "ArgumentError",
    "message": "An invalid argument was supplied: name must be one of Work, Home, Billing, or Other"
  }
}

// Authentication failure
{
  "error": "invalid_grant",
  "error_description": "The provided authorization grant is invalid..."
}

// Rate limiting
{
  "error": {
    "type": "RateLimitError",
    "message": "Rate limit exceeded"
  }
}
```

### Best Practices

1. **Always Check Response Status**:
   ```javascript
   if (!response.ok) {
     const text = await response.text();
     throw new Error(`Clio API error: ${text}`);
   }
   ```

2. **Handle Token Refresh Failures**:
   - If refresh fails, credential may be revoked
   - Log error and notify user to re-authenticate

3. **Validate Before Sending**:
   - Check email exists before client creation
   - Verify enum field values (phone/address names)
   - Ensure type-specific fields match contact type

---

## Data Mapping

### Instructions → Clio Contact

```javascript
// Determine type from Instructions.ClientType
const isCompany = instruction.ClientType === 'Company';

const contactData = {
  type: isCompany ? 'Company' : 'Person',
  primary_email_address: instruction.Email,
  
  // Person fields (only if !isCompany)
  first_name: instruction.FirstName,
  last_name: instruction.LastName,
  
  // Company fields (only if isCompany)
  name: instruction.CompanyName,
  
  // Common fields
  phone_numbers: instruction.Phone ? [{
    name: 'Work',  // Default to 'Work'
    number: instruction.Phone,
    default_number: true
  }] : [],
  
  addresses: (instruction.Street || instruction.City || instruction.Postcode) ? [{
    name: 'Home',  // Default to 'Home' for individuals, 'Work' for companies
    street: instruction.Street || '',
    city: instruction.City || '',
    province: instruction.County || '',
    postal_code: instruction.Postcode || '',
    country: instruction.Country || 'United Kingdom'
  }] : []
};
```

### Clio Matter → Matters Table

```javascript
const matterRecord = {
  MatterID: clioMatter.id.toString(),
  InstructionRef: instruction.InstructionRef,
  Status: clioMatter.status,  // 'Open', 'Closed', 'Pending'
  OpenDate: clioMatter.open_date,
  ClientID: clioMatter.client.id.toString(),
  DisplayNumber: clioMatter.display_number,
  ClientName: clioMatter.client.name,
  ClientType: instruction.ClientType,
  Description: clioMatter.description,
  PracticeArea: clioMatter.practice_area?.name,
  ResponsibleSolicitor: instruction.HelixContact,
  OriginatingSolicitor: instruction.HelixContact,
  Source: 'helix-hub-instruction'
};
```

---

## Rate Limits

**Clio API Rate Limits** (as of v4):
- 500 requests per 10 seconds per access token
- Burst limit: 50 requests per second

**Handling**:
- Implement exponential backoff for retries
- Check `X-RateLimit-Remaining` header
- Use bulk operations when available

---

## Related Files

- Matter creation: `server/routes/matter-operations.js`
- Backfill script: `scripts/backfill-instruction-matters.js`
- Key Vault config: Environment variables or `local.settings.json`

---

## Troubleshooting Checklist

When Clio API calls fail:

1. ✅ Check response status and error message
2. ✅ Verify access token is fresh (not expired)
3. ✅ Confirm enum field values are valid (phone/address names)
4. ✅ Check type-specific fields match contact type (Person vs Company)
5. ✅ Validate email address exists and is properly formatted
6. ✅ Ensure refresh token is being updated in Key Vault
7. ✅ Verify correct Clio region (EU vs US) is being used
8. ✅ Check staff initials exist in Key Vault with proper format
