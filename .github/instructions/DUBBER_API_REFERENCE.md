# Dubber API Reference

Captured from developer.dubber.net (26 Mar 2026). Portal requires Mashery login — this file is the offline reference.

## Auth Status — CONFIRMED WORKING (26 Mar 2026)

| Secret | Vault Name | Status |
|--------|-----------|--------|
| Dubber Auth ID (username) | `dubber-authid` | ✅ Vaulted (11 chars) |
| Dubber Auth Token (password) | `dubber-authtoken` | ✅ Vaulted (20 chars) |
| UK1 Mashery Client ID | `dubber-uk1key` | ✅ Vaulted (24 chars) |
| UK1 Mashery Client Secret | `dubber-uk1secret` | ✅ Vaulted (10 chars) |

Portal account: `helix-law` / `lz@helix-law.com`
Registered: 26 Mar 2026

### Active Region

| Region | Package | Status | Rate Limit |
|--------|---------|--------|------------|
| **UK1 Prod** | Dubber UK1 Prod Plan | ✅ **Active** | 2/sec, 5000/day |

## OAuth 2.0 Auth Flow

Dubber uses OAuth 2.0. Three grant types supported:

### 1. Authorization by Password (server-to-server, our primary flow)

```
POST https://api.dubber.net/<Region>/v1/token
Content-Type: application/x-www-form-urlencoded

grant_type=password
&client_id=<MASHERY_CLIENT_ID>
&client_secret=<MASHERY_CLIENT_SECRET>
&username=<DUBBER_AUTH_ID>
&password=<DUBBER_AUTH_TOKEN>
```

### 2. Authorization by Code (interactive OAuth redirect flow)

1. Redirect user to Dubber authorization URL (composed of app key, redirect URI, response type, state)
2. User logs in at Dubber
3. Dubber redirects back with authorization code
4. Exchange code for access token via `POST /token`
5. Store access token securely

### 3. Authorization by Bearer Assertion

SAML2 bearer grant: `grant_type=urn:ietf:params:oauth:grant-type:saml2-bearer`

### Token Lifecycle

- **Access token**: valid **24 hours**
- **Refresh token**: valid **28 days** — if refreshed within this window, user is not re-prompted
- Use header: `Authorization: Bearer <ACCESS_TOKEN>`
- Token revocation endpoint available
- Rate limit: **500 calls/day** per key (from earlier Getting Started docs)

### Supported Grant Types (Code 6001)

- `password`
- `refresh_token`
- `implicit`
- `urn:ietf:params:oauth:grant-type:saml2-bearer`

### Supported Response Types (Code 6002)

- `code`

## Region

**Confirmed: `uk1`** — portal is at `uk1.dubber.net/app`.
Token endpoint: `POST https://api.dubber.net/uk1/v1/token`
Target: UK1 Prod (skip sandbox — this is the production backend).

## API Endpoints (from Interactive API docs TOC)

### Account Management
| Endpoint | Method | Description |
|----------|--------|-------------|
| Get API resource profile | GET | Get profile of API resource |
| Get Account Details | GET | Account info |
| Post Account Details | POST | Create account |
| Put Account Details | PUT | Update account |
| Account Retention periods | GET | Retention config |
| Get Account Users | GET | List users |
| Post Account Users | POST | Create user |

### User Management
| Endpoint | Method | Description |
|----------|--------|-------------|
| Find User | GET | Search for user |
| Get User Details | GET | User info |
| Put User Details | PUT | Update user |
| Delete User Details | DELETE | Remove user |

### Recordings (core for our use case)
| Endpoint | Method | Description |
|----------|--------|-------------|
| Get Account Recordings | GET | List recordings |
| Post Account Recordings | POST | Create recording |
| Get Recording Details | GET | Single recording info |
| Get Recording Link | GET | Playback URL |
| Get Recording Waveform | GET | Waveform data |
| Put Recording Metadata | PUT | Update metadata |
| Post Recording Tags | POST | Add tags |
| Delete Recording Tags | DELETE | Remove tags |
| Delete Recording Details | DELETE | Delete recording |

### DUB Points (provisioning)
| Endpoint | Method | Description |
|----------|--------|-------------|
| Post Account DUB Points | POST | Create DUB point |
| Get Account DUB Points | GET | List DUB points |
| Find DUB Point | GET | Search DUB point |
| Get DUB Point | GET | Single DUB point |
| Put Move DUB Point | PUT | Move DUB point |
| Put Move Unidentified DUB Point | PUT | Move unidentified |
| Put DUB Point (change product) | PUT | Change product |
| Delete DUB Point | DELETE | Remove DUB point |

### Groups
| Endpoint | Method | Description |
|----------|--------|-------------|
| Get Group Details | GET | Group info |
| Get Group Groups Index | GET | Subgroups |
| Get Group Accounts Index | GET | Group accounts |
| Get Group Unidentified DUB Points | GET | Unidentified points |
| Post Group Details | POST | Create group |
| Post Group Users | POST | Add group users |

### Teams
| Endpoint | Method | Description |
|----------|--------|-------------|
| Get Account Teams | GET | List teams |
| Post Account Teams | POST | Create team |
| Delete Account Teams | DELETE | Remove team |
| Get/Post/Put/Delete Account Team Member(s) | Various | Team member CRUD |
| Get Account Team Members Dub Points | GET | Team DUB points |

### AI & Insights
| Endpoint | Method | Description |
|----------|--------|-------------|
| AI information | GET | AI/transcription data |
| Get/Post Insights Export | GET/POST | Export insights |
| Data exports | Various | Bulk data export |

### Integration
| Endpoint | Method | Description |
|----------|--------|-------------|
| Rest Hooks | Various | Webhook notifications |
| Multi Part Uploads | POST | Large file uploads |
| MS Teams Settings | Various | Teams integration config |
| Provisioning Example | — | Reference provisioning flow |

## Request Format

- Content-Type: `application/json` (required — error 1004 if missing)
- HTTPS required (error 1025 if not SSL)

## Error Response Format

```json
{
  "status": 404,
  "message": "Resource Not Found",
  "code": 1009,
  "more_info": "https://developer.dubber.net/docs/read/common_details/API_Error_Dictionary#..."
}
```

Validation errors include `details` array:
```json
{
  "code": 2000,
  "details": [{
    "code": 4001,
    "details": ["Invalid parameter: after_id"],
    "message": "Invalid Parameters"
  }],
  "message": "Validation Errors",
  "status": 400
}
```

OAuth errors follow RFC 6749 §5.2:
```json
{
  "error": "invalid_request",
  "error_description": "Invalid credentials supplied",
  "error_url": "https://developer.dubber.net/..."
}
```

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK |
| 400 | Bad Request — invalid params |
| 401 | Unauthorized — check credentials |
| 403 | Rate limit exceeded |
| 404 | Not Found |
| 500 | Internal Server Error |
| 504 | Gateway Timeout |

## Key Error Codes (operational reference)

| Code | Meaning | Action |
|------|---------|--------|
| 1003 | Invalid Credentials | Check AuthID + AuthToken on Dubber dashboard |
| 1005 | Method Not Allowed / Invalid Endpoint | Check HTTP method and URL |
| 1009 | Resource Not Found | Check resource ID |
| 1010 | Feature Not Enabled | Tier/plan doesn't include this endpoint |
| 1019 | Forbidden: Not Authorized | API key not recognised or bad signature |
| 1020 | Forbidden: Account Inactive | API key not approved or disabled |
| 1021 | Forbidden: QPS Limit | Too many requests/second — back off |
| 1022 | Forbidden: Daily Rate Limit | Daily quota exceeded — contact Dubber |
| 1024 | Forbidden: Rate Limit Exceeded | Service over-capacity — retry |
| 1038 | Invalid/Expired Token | Refresh or re-auth |
| 1042 | Invalid Scope | Domain scope misconfigured |
| 1044 | Endpoint Removed | Endpoint deprecated — won't return data |
| 6001 | Invalid Grant Type | Use: password, refresh_token, implicit, saml2-bearer |

## Webhook (Rest Hooks) Events

Supported event types:
- `recording.create`
- `recording.update`

Post URL max 2000 chars, must be `http` or `https`.

## Recording Constraints

- Tags: max 25 chars each
- Metadata keys: max 50 chars, alphanumeric only; values: max 255 chars
- From/To speaker: max 50 chars, cannot be blank
- Supported formats: mp3, wav
- Call types: must have valid direction
- Recording types: `recording` or `voicemail`
- Transcription: must match JSON schema, status must be `Pending`

## User Constraints

- first_name, last_name: max 128 chars, cannot be blank
- email: must be valid, unique
- role: `Administrator` or `Standard User`
- user_type: `reserved`, `playback`, `payg`
- Supported languages: en, de, es, fr, it, ja, nl, pl, pt, zh-CN, zh-TW

## DUB Point Products

- `reserved`
- `payg`
- `playback`

## DUB Point External Types

- BroadWorks
- AudioCodes
- Cisco
- Metaswitch

## Confirmed Working Endpoints (26 Mar 2026)

All paths use base: `https://api.dubber.net/uk1/v1`
Account slug: `helixlaw`

| Endpoint | Path | Status | Notes |
|----------|------|--------|-------|
| Token exchange | `POST /uk1/v1/token` | ✅ 200 | 24hr access, 28-day refresh |
| Account details | `GET /accounts/helixlaw` | ✅ 200 | Name, status, billing |
| Users list | `GET /accounts/helixlaw/users` | ✅ 200 | 20 users, all Standard except LZ (Admin) |
| DUB Points | `GET /accounts/helixlaw/dub_points` | ✅ 200 | 20 points, all AI-enabled |
| Teams | `GET /accounts/helixlaw/teams` | ✅ 200 | 1 team ("All") |
| Notifications | `GET /accounts/helixlaw/notifications` | ✅ 200 | Empty (webhooks not configured yet) |
| Recordings list | `GET /accounts/helixlaw/recordings` | ✅ 200 | Returns recent recordings |
| Recording detail | `GET /recordings/{id}` | ✅ 200 | Full metadata, sentiment, duration |
| **AI / Transcript** | `GET /accounts/helixlaw/recordings/{id}/ai` | ✅ 200 | **Per-sentence transcript + sentiment** |
| Recording link | `GET /recordings/{id}/link` | ❓ Untested | Playback URL |
| Transcript (alt path) | `GET /recordings/{id}/transcript` | ❌ 404 | Wrong path — use `/accounts/helixlaw/recordings/{id}/ai` |
| Insights | `GET /accounts/helixlaw/recordings/{id}/insights` | ❌ 404 | Not available |
| Moments | `GET /recordings/{id}/moments` | ❌ 404 | Not available |

### CRITICAL PATH NOTE
Transcripts are at `/accounts/helixlaw/recordings/{id}/ai`, NOT `/recordings/{id}/transcript`.
The `/ai` endpoint returns sentence-level transcript + per-sentence sentiment scores.

### Account Details (discovered)

```
Account ID:   helixlaw
Account Name: Helix Law
Billing ID:   UK12372339284A1
Status:       Active
Timezone:     Europe/London
Product:      DUR_T_02 (Dubber Unified Recording, AI Tier 2)
Provider:     microsoft (Teams integration)
Users:        20 (all AI-enabled DUB points)
Admin:        lz-helix-law-com (Lukasz Zemanek)
```

### ⚠️ SPEAKER DIARISATION — NOT AVAILABLE

**Confirmed 27 Mar 2026**: Dubber does NOT provide speaker diarisation. Every sentence returns `"speaker": "Multiple speakers"` across all recordings. The sentence object has exactly 3 fields (`speaker`, `content`, `sentiment`) — no hidden speaker data. Endpoints `/speakers`, `/diarization`, `/insights`, `/analysis` all return 404. This is a platform limitation on DUR_T_02, not a config issue. Email sent to Dubber to confirm. The Hub UI handles this: shows sentence numbers instead of speaker labels, with a "diarisation pending" note. If Dubber ever enables it, distinct speaker labels will render automatically.

### AI/Transcript Response Shape

```json
{
  "self": "https://api.dubber.net/uk1/v1/accounts/helixlaw/recordings/{id}/ai",
  "recording": "https://api.dubber.net/uk1/v1/recordings/{id}",
  "id": "{recording_id}",
  "status": "Active",
  "document_sentiment": 0.055,
  "sentences": [
    {
      "speaker": "Multiple speakers",
      "content": "Yeah, I don't know what I did there.",
      "sentiment": 0
    }
  ]
}
```

### Recording Response Shape

```json
{
  "id": "1630277230047825923",
  "to": "Christopher Smith",
  "from": "Thaddeus Ray",
  "call_type": "inbound",
  "recording_type": "recording",
  "channel": "Christopher Smith",
  "status": "Active",
  "start_time": "Thu, 26 Mar 2026 16:51:46 +0000",
  "duration": 464,
  "type": "audio",
  "document_sentiment": { "score": 0.055 },
  "meta_tags": {
    "recording-platform": "microsoft",
    "recorder-identifier": "uk_south.uk1.msteams"
  }
}
```

## Next Steps

1. ~~Complete Mashery app registration~~ ✅
2. ~~Vault credentials~~ ✅ (4 secrets in helix-keys)
3. ~~Run token exchange~~ ✅ (UK1 region, 200 OK)
4. ~~Discover account ID~~ ✅ (`helixlaw`)
5. ~~Test recording access~~ ✅ (19 recordings, transcripts working)
6. Build `server/routes/dubber.js` following Clio pattern
7. Build Hub UI panel (dev preview gated)
8. Configure webhooks for real-time recording notifications
9. Map Dubber users → Helix team members (by name or external_identifier)
