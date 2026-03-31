# Dubber Integration Brief — Enquiry Platform

**For**: enquiry-processing-v2 agent  
**From**: Helix Hub (tab-app) — 26 Mar 2026  
**Status**: Dubber API confirmed fully operational. Credentials vaulted. Ready for implementation.

---

## ⚠️ SPEAKER DIARISATION — CONFIRMED NOT AVAILABLE (27 Mar 2026)

**Dubber does NOT provide speaker diarisation.** This has been exhaustively verified by probing the live API across all 20 recordings.

- Every sentence in the `/recordings/{id}/ai` response has `"speaker": "Multiple speakers"` — no exceptions.
- Each sentence object contains exactly 3 fields: `speaker`, `content`, `sentiment`. No hidden speaker ID, no channel index, no participant reference.
- The following endpoints were probed and **do not exist** (all returned 404): `/speakers`, `/diarization`, `/analysis`, `/insights`, `/moments`, `/summary`, `/transcript`.
- The playback link endpoint (`/recordings/{id}/link`) also returned 404.
- This is consistent across inbound, outbound, internal, and external calls.
- Our plan is DUR_T_02 (Dubber Unified Recording, AI Tier 2). An email has been sent to Dubber asking if diarisation can be enabled or is on their roadmap.

**DO NOT** attempt to:
- Find a different API endpoint for speaker data — they don't exist
- Parse speaker identity from the `speaker` field — it's always "Multiple speakers"
- Assume this is a bug or misconfiguration on our side — it's a platform limitation

**The UI already handles diarisation gracefully**: if Dubber ever returns distinct speaker labels, the transcript view will automatically show them. Until then, sentence index numbers are shown instead, with a "Dubber diarisation pending" note.

---

## 1. What Is Dubber

Dubber is our call recording platform. It records all Microsoft Teams calls across the firm (20 users), transcribes them with AI, and scores sentiment per-sentence. It replaces CallRail as the primary call data source.

We need the enquiry platform to **ingest Dubber recordings into SQL**, so both the enquiry platform and the Hub can read call data from the database — no real-time API hits on page load.

---

## 2. Credentials — Azure Key Vault

**Vault**: `helix-keys` (`https://helix-keys.vault.azure.net/`)

| Secret Name | Content | Length |
|-------------|---------|--------|
| `dubber-authid` | Dubber Auth ID (OAuth username) | 11 chars |
| `dubber-authtoken` | Dubber Auth Token (OAuth password) | 20 chars |
| `dubber-uk1key` | Mashery Client ID (UK1 region) | 24 chars |
| `dubber-uk1secret` | Mashery Client Secret (UK1 region) | 10 chars |

Access pattern (DefaultAzureCredential):
```javascript
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';

const credential = new DefaultAzureCredential();
const client = new SecretClient('https://helix-keys.vault.azure.net/', credential);
const secret = await client.getSecret('dubber-authid');
// secret.value contains the credential
```

All 4 secrets are confirmed present and working as of 26 Mar 2026.

---

## 3. Authentication — OAuth 2.0 Password Grant

```
POST https://api.dubber.net/uk1/v1/token
Content-Type: application/x-www-form-urlencoded

grant_type=password
&client_id={dubber-uk1key}
&client_secret={dubber-uk1secret}
&username={dubber-authid}
&password={dubber-authtoken}
```

**Response:**
```json
{
  "access_token": "...",
  "token_type": "bearer",
  "expires_in": 86400,
  "refresh_token": "..."
}
```

- Access token valid **24 hours**
- Refresh token valid **28 days**
- Use header: `Authorization: Bearer {access_token}`
- **Rate limits**: 2 requests/second, 5000 requests/day — this is why we store in SQL instead of fetching live

---

## 4. API Endpoints (Confirmed Working)

**Base URL**: `https://api.dubber.net/uk1/v1`  
**Account slug**: `helixlaw`

### List Recordings
```
GET /accounts/helixlaw/recordings
Authorization: Bearer {token}
```

Response:
```json
{
  "recordings": [
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
  ]
}
```

Key fields:
- `id` — unique recording ID (string, large integer format)
- `to` / `from` — speaker **names** (not phone numbers — Dubber is Teams-based)
- `call_type` — `"inbound"` or `"outbound"`
- `duration` — seconds (integer)
- `start_time` — RFC 2822 format (`"Thu, 26 Mar 2026 16:51:46 +0000"`)
- `document_sentiment.score` — float, overall call sentiment
- `meta_tags.recording-platform` — always `"microsoft"` for us

### Get Recording Detail
```
GET /recordings/{recording_id}
Authorization: Bearer {token}
```
Returns the same shape as a single recording from the list.

### Get AI Transcript (CRITICAL — correct path)
```
GET /accounts/helixlaw/recordings/{recording_id}/ai
Authorization: Bearer {token}
```

**⚠️ The path `/recordings/{id}/transcript` returns 404. You MUST use `/accounts/helixlaw/recordings/{id}/ai`.**

Response:
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
    },
    {
      "speaker": "Multiple speakers",
      "content": "Thanks for calling Helix Law, how can I help?",
      "sentiment": 0.2
    }
  ]
}
```

Key fields:
- `document_sentiment` — overall sentiment (float, typically -1 to 1)
- `sentences[]` — ordered array of transcript segments
- `sentences[].speaker` — speaker label (**ALWAYS "Multiple speakers"** — Dubber does NOT do diarisation. See warning at top of this file. Do not attempt to fix or work around this.)
- `sentences[].content` — the transcribed text
- `sentences[].sentiment` — per-sentence sentiment score

### Get Recording Playback Link (Untested)
```
GET /recordings/{recording_id}/link
Authorization: Bearer {token}
```
Expected to return a signed/expiring playback URL. Not yet tested — probe this first.

### List Users
```
GET /accounts/helixlaw/users
Authorization: Bearer {token}
```
Returns 20 users. Use this to build the Dubber user → team member mapping.

### Webhooks (Not Yet Configured)
```
GET /accounts/helixlaw/notifications
POST /accounts/helixlaw/notifications
```
Supported events: `recording.create`, `recording.update`
Post URL max 2000 chars, must be `http` or `https`.

---

## 5. Endpoints That DO NOT Work

| Path | Status | Note |
|------|--------|------|
| `GET /recordings/{id}/transcript` | 404 | Wrong path |
| `GET /accounts/helixlaw/recordings/{id}/insights` | 404 | Not available on our tier |
| `GET /recordings/{id}/moments` | 404 | Not available |
| `GET /recordings?page=0&page_size=5` | 400 | Pagination uses `after_id` cursor, not page/page_size |

---

## 6. Architecture Decision — Store in SQL, Don't Fetch Live

**Why:**
- Rate limit (2/sec, 5000/day) makes real-time fetch unviable for team-wide use
- Recordings are immutable — once recorded and transcribed, data never changes
- Enables pre-matching recordings to enquiries by speaker name
- Enables search, reporting, sentiment dashboards without API calls
- Works when Dubber API is down

**Ingestion strategy (recommended):**
1. **Webhook-driven** — Register `recording.create` webhook → fetch recording + transcript → write to SQL
2. **Scheduled poll fallback** — Hourly cron fetches latest recordings to catch anything webhooks missed
3. **One-time backfill** — Import existing ~19 recordings on first deploy

---

## 7. Actual SQL Schema (created by enquiry-processing-v2)

**Target database**: Instructions (`instructions` / `INSTRUCTIONS_SQL_CONNECTION_STRING`)  
**Server**: `instructions.database.windows.net`

> **Note:** enquiry-processing-v2 owns the schema and chose its own column names (diverging from the original proposal below). This section reflects the **actual production tables** as of Mar 2026.

### Table: `dubber_recordings` (38 columns — key columns shown)

```sql
-- PK: recording_id (nvarchar(64))
-- No FK to enquiries — matching is by phone/name at query time
recording_id              NVARCHAR(64)       NOT NULL PRIMARY KEY,
from_party                NVARCHAR(200)      NULL,   -- caller name/number
from_label                NVARCHAR(200)      NULL,   -- display label
to_party                  NVARCHAR(200)      NULL,   -- recipient name/number
to_label                  NVARCHAR(200)      NULL,   -- display label
call_type                 NVARCHAR(20)       NULL,   -- "inbound" / "outbound"
recording_type            NVARCHAR(20)       NULL,   -- "recording" / "voicemail"
channel                   NVARCHAR(200)      NULL,   -- DUB point / channel label
status                    NVARCHAR(20)       NULL,   -- "Active"
start_time_utc            DATETIMEOFFSET     NOT NULL,
duration_seconds          INT                NULL,
document_sentiment_score  DECIMAL            NULL,   -- overall sentiment (0–1)
ai_document_sentiment     DECIMAL            NULL,   -- AI-derived sentiment
document_emotion_json     NVARCHAR(MAX)      NULL,   -- JSON: { joy: 0.4, anger: 0.1, ... }
matched_team_initials     NVARCHAR(10)       NULL,   -- e.g. "CS" (team member on call)
matched_team_email        NVARCHAR(200)      NULL,   -- e.g. "chris@helix-law.com"
matched_dubber_user_id    NVARCHAR(64)       NULL,   -- FK to dubber_user_map
match_strategy            NVARCHAR(50)       NULL,   -- how match was determined
recording_json            NVARCHAR(MAX)      NULL,   -- full Dubber API response
ai_json                   NVARCHAR(MAX)      NULL,   -- full AI/transcript API response
meta_tags_json            NVARCHAR(MAX)      NULL,   -- Dubber tags metadata
last_synced_utc           DATETIMEOFFSET     NULL
```

### Table: `dubber_transcript_sentences` (7 columns)

```sql
-- Composite key: (recording_id, sentence_index)
recording_id              NVARCHAR(64)       NOT NULL,
sentence_index            INT                NOT NULL,
speaker                   NVARCHAR(200)      NULL,
content                   NVARCHAR(MAX)      NULL,
sentiment                 DECIMAL            NULL,   -- per-sentence sentiment score
raw_json                  NVARCHAR(MAX)      NULL,
last_synced_utc           DATETIMEOFFSET     NULL
```

### Table: `dubber_user_map` (17 columns — key columns shown)

```sql
-- PK: dubber_user_id
dubber_user_id            NVARCHAR(64)       NOT NULL PRIMARY KEY,
display_name              NVARCHAR(200)      NULL,
first_name                NVARCHAR(100)      NULL,
last_name                 NVARCHAR(100)      NULL,
role                      NVARCHAR(50)       NULL,
matched_team_email        NVARCHAR(200)      NULL,
matched_team_initials     NVARCHAR(10)       NULL,
match_strategy            NVARCHAR(50)       NULL,
last_synced_utc           DATETIMEOFFSET     NULL
```

### Table: `dubber_recording_summaries` (7 columns)

```sql
-- Composite key: (recording_id, summary_source, summary_type)
recording_id              NVARCHAR(64)       NOT NULL,
summary_source            NVARCHAR(50)       NULL,   -- e.g. "dubber_ai"
summary_type              NVARCHAR(50)       NULL,   -- e.g. "abstractive"
summary_text              NVARCHAR(MAX)      NULL,   -- plain-text summary
summary_json              NVARCHAR(MAX)      NULL,   -- structured summary data
source_updated_at_utc     DATETIMEOFFSET     NULL,
last_synced_utc           DATETIMEOFFSET     NULL
```

### Current data volumes (as of Mar 2026)

| Table | Rows |
|-------|------|
| `dubber_recordings` | 20 |
| `dubber_transcript_sentences` | 1,521 |
| `dubber_recording_summaries` | 19 |
| `dubber_user_map` | 20 |

---

## 8. Ingestion Flow

```
1. Dubber webhook fires (recording.create)
       ↓
2. Fetch recording detail:  GET /recordings/{id}
       ↓
3. Fetch transcript:        GET /accounts/helixlaw/recordings/{id}/ai
       ↓
4. Parse start_time from RFC 2822 to DATETIME2
       ↓
5. UPSERT into dubber_recordings (ON id)
       ↓
6. DELETE + INSERT sentences into dubber_transcript_sentences
       ↓
7. Attempt auto-match:
   - Look up from_speaker / to_speaker against dubber_user_map
   - If one speaker is a team member, the other is the external party
   - Search enquiries by name match (First_Name + Last_Name)
   - If matched → set matched_enquiry_id, matched_fee_earner, matched_at
       ↓
8. Done — Hub reads from SQL
```

### Auto-matching logic

Dubber recordings identify speakers by **name**, not phone number:
- `from`: "Thaddeus Ray" (the person who initiated)
- `to`: "Christopher Smith" (the person who received)

**Strategy:**
1. Maintain `dubber_user_map` — fetched from `GET /accounts/helixlaw/users` on startup
2. When a recording arrives, check if `from_speaker` or `to_speaker` matches a Dubber user name
3. The non-team speaker is the external party — search `enquiries.First_Name + Last_Name` for matches
4. If ambiguous (multiple enquiry matches), leave `matched_enquiry_id` NULL for manual resolution

---

## 9. How the Hub Consumes This Data (IMPLEMENTED)

The Hub (tab-app) reads Dubber data from the Instructions DB via `server/routes/dubberCalls.js`:

### Server endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/dubberCalls?teamInitials=BR` | GET | Recordings by team member |
| `/api/dubberCalls/search` | POST | Search by phone (UK normalised) and/or name |
| `/api/dubberCalls/:recordingId/transcript` | GET | Sentences + recording meta + summaries (parallel) |
| `/api/dubberCalls/recent?limit=20` | GET | Recent recordings across all team |

### Client integration

1. **EnquiryCalls.tsx** — Dedicated call history tab. Searches by `enquiry.Phone_Number` / `Secondary_Phone` (fallback to name). Shows recording cards with sentiment, expandable transcript + AI summary.
2. **EnquiryTimeline.tsx** — Dubber recordings merged into unified timeline alongside emails, pitches, instructions, documents. Auto-fetched on timeline load.
3. **Matching** — No `matched_enquiry_id` FK. Hub matches at query time by phone number (UK normalised: strip `+44`/leading `0`) or by name against `from_party`/`to_party`/`from_label`/`to_label`.

### Phone number normalisation

```javascript
// Strip country code and leading zero for LIKE matching
const normalised = phone.replace(/\D/g, '').replace(/^(44|0)/, '');
// Query: WHERE from_party LIKE '%' + @norm + '%' OR to_party LIKE '%' + @norm + '%'
```

---

## 10. Rate Limit Considerations

| Limit | Value | Impact |
|-------|-------|--------|
| QPS | 2 requests/second | Add 600ms delay between API calls during backfill |
| Daily | 5000 requests/day | Backfill 19 recordings = ~38 calls (recording + transcript). Well within budget. |
| Token | 24hr validity | Cache token, refresh before expiry |

**Error codes to handle:**
- `1021` — QPS limit exceeded (back off, retry after 1s)
- `1022` — Daily rate limit exceeded (stop, retry next day)
- `1038` — Token expired (refresh or re-auth)

---

## 11. Account Summary

| Property | Value |
|----------|-------|
| Account ID | `helixlaw` |
| Account Name | Helix Law |
| Region | UK1 |
| API Base | `https://api.dubber.net/uk1/v1` |
| Product | DUR_T_02 (AI Tier 2) |
| Provider | Microsoft Teams |
| Users | 20 |
| Timezone | Europe/London |
| Current recordings | ~19 |
| Billing ID | UK12372339284A1 |

---

## 12. Implementation Status

- [x] Access Key Vault (`helix-keys`) with DefaultAzureCredential — fetch all 4 `dubber-*` secrets
- [x] Implement OAuth2 password grant token exchange with caching (24hr TTL)
- [x] Create SQL tables (`dubber_recordings`, `dubber_transcript_sentences`, `dubber_user_map`, `dubber_recording_summaries`)
- [x] Build user map — fetch from `GET /accounts/helixlaw/users`, populate `dubber_user_map`
- [x] Build recording ingestion — fetch recording detail + AI transcript, upsert to SQL
- [x] Build auto-match logic — match speakers to team members (by name/email)
- [x] Backfill existing ~20 recordings (20 recordings, 1521 sentences, 19 summaries)
- [x] Hub server route — `server/routes/dubberCalls.js` (search, transcript, recent, by-team)
- [x] Hub EnquiryCalls.tsx — full call history panel with expandable transcripts + sentiment
- [x] Hub EnquiryTimeline.tsx — Dubber recordings merged into unified timeline
- [ ] Register Dubber webhook for `recording.create` (needs a public HTTPS endpoint)
- [ ] Build scheduled poll fallback (hourly, fetch latest recordings, skip already-ingested)
- [ ] Probe `GET /recordings/{id}/link` for playback URLs — cache if signed/expiring
- [ ] Home page — Show recent calls with sentiment badges on enquiry cards
- [ ] CCL AI context — Read transcript sentences from SQL for letter generation
- [ ] Reporting — Call volume, avg duration, sentiment trends by area of work

---

## 13. Token Exchange — Working Code Reference

This exact code runs successfully against UK1 prod:

```javascript
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';

const credential = new DefaultAzureCredential();
const client = new SecretClient('https://helix-keys.vault.azure.net/', credential);

async function getSecret(name) {
  const s = await client.getSecret(name);
  return s.value;
}

const [authId, authToken, clientId, clientSecret] = await Promise.all([
  getSecret('dubber-authid'),
  getSecret('dubber-authtoken'),
  getSecret('dubber-uk1key'),
  getSecret('dubber-uk1secret'),
]);

const res = await fetch('https://api.dubber.net/uk1/v1/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'password',
    client_id: clientId,
    client_secret: clientSecret,
    username: authId,
    password: authToken,
  }).toString(),
});

const { access_token } = await res.json();
// Use: { Authorization: `Bearer ${access_token}` }
```

---

*Generated from Helix Hub session, 26 Mar 2026. All endpoints confirmed working against UK1 prod.*
