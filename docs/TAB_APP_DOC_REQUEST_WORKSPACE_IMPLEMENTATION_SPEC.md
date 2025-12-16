# Tab App → Doc‑Request Workspace integration (implementation spec)

**Date:** 2025‑12‑15  
**Target repo:** `HelixAutomations/tab-app`  
**Backend repo:** `HelixAutomations/instruct-pitch` (already implemented)  
**Primary goal:** Generate and distribute a **clean** doc-request workspace link of the form `/pitch/<passcode>` (no query params), backed by a Deal.

---

## 1) Outcome (what “done” means)

From an Enquiry in Tab App, a fee earner can:

1. Click **Create / Open doc-request workspace**.
2. Tab App calls the Pitch backend to **create or reuse** a doc-request Deal for that enquiry.
3. Tab App opens a clean link: `https://<pitch-host>/pitch/<passcode>`.

Optional (recommended): show a small indicator/count that documents exist for this enquiry.

---

## 2) Current backend capabilities (already in instruct-pitch)

### A) Ensure / reuse a doc-request Deal

**Endpoint**: `POST /api/doc-request-deals/ensure`

**Request body**
```json
{
  "enquiry_id": 12345,
  "requested_by": "fee.earner@helix-law.com",
  "service_description": "Document request",
  "area_of_work": "Onboarding",
  "pitched_by": "FEEARNER" 
}
```

Only `enquiry_id` and `requested_by` are required.

**Response**
```json
{
  "dealId": 9876,
  "passcode": "58291",
  "prospectId": 12345,
  "enquiryId": 12345,
  "dealKind": "DOC_REQUEST",
  "urlPath": "/pitch/58291"
}
```

**Behavior**
- If a doc-request Deal already exists for the enquiry, it reuses it and returns the existing passcode.
- Otherwise it creates a new Deal, generates a unique passcode, and returns it.
- Returns `404 {"error":"Enquiry not found"}` if the enquiry id doesn’t exist.

### B) Prospect docs API (fee-earner uploads)

The upload/list/download/delete endpoints exist already for fee-earner documents:

- `POST /api/prospect-documents/upload` (multipart/form-data)
- `GET /api/prospect-documents?enquiry_id=<id>` (and `deal_id=<id>` when DB column exists)
- `GET /api/prospect-documents/:id/download`
- `DELETE /api/prospect-documents/:id` (soft delete)

Tab App **does not need** to implement upload UI immediately if it only needs to generate/open the workspace.

---

## 3) Data / schema prerequisites

### Minimal (link generation only)
- No DB migration changes are required in Tab App.
- Pitch backend will work even if the new discriminator columns are not present yet (it has runtime fallbacks).

### Recommended (better linking / filtering)
In the Pitch DB, apply migration:
- `apps/pitch/backend/migrations/002_doc_request_deals.sql`

This adds:
- `Deals.EnquiryId` (nullable)
- `Deals.DealKind` (nullable)
- `prospect_docs.deal_id` (nullable)

With `prospect_docs.deal_id`, uploads can be associated to the latest doc-request Deal, and lists can be filtered by deal.

---

## 4) Tab App: UI requirements

### Location
In Tab App Enquiry detail view (where fee earners work), add a small section:

- Button: **Create / Open doc-request workspace**
- Optional: read-only display of the generated URL + Copy button

### UX rules
- One click should *both* ensure the Deal and then open the link.
- Handle errors with a clear message:
  - 404 → “Enquiry not found in Pitch system”
  - 400 → “Invalid request (missing enquiry id or user email)”
  - 500 → “Pitch service error”

---

## 5) Tab App: API integration details

### Inputs
Tab App must provide:
- `enquiry_id`: the Enquiry’s numeric ID.
- `requested_by`: current user’s email address.
  - Must be a `@helix-law.com` (or `@helix.law`) email.

### Implementation sketch (TypeScript)

```ts
type EnsureDocRequestDealResponse = {
  dealId: number;
  passcode: string;
  urlPath?: string;
};

async function ensureDocRequestWorkspace(enquiryId: number, requestedBy: string) {
  const r = await fetch(`${PITCH_BASE_URL}/api/doc-request-deals/ensure`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enquiry_id: enquiryId, requested_by: requestedBy }),
    credentials: 'include' // if your setup uses cookies; otherwise omit
  });

  if (!r.ok) {
    const text = await r.text();
    throw new Error(text || `Pitch returned HTTP ${r.status}`);
  }

  const data = (await r.json()) as EnsureDocRequestDealResponse;
  if (!data.passcode) throw new Error('Pitch response missing passcode');

  return data;
}

function buildWorkspaceUrl(passcode: string) {
  return `${PITCH_BASE_URL}/pitch/${encodeURIComponent(passcode)}`;
}
```

### Opening the link
- Prefer `window.open(url, '_blank')` from a user click.
- Or use your app’s router if you embed Pitch in an iframe/tab (only if that’s already supported).

---

## 6) Optional: show doc counts in Tab App

If you want a “Documents: N” badge on the enquiry:

- Call: `GET /api/prospect-documents?enquiry_id=<id>`
- Count returned `documents.length`.

Notes:
- This is “fee-earner uploads” only (client uploads are elsewhere).
- If `deal_id` is available in DB and you want doc-request-workspace scoped docs only, you can list by `deal_id` instead.

---

## 7) Security / environment assumptions

- Tab App is an internal app; only staff should be able to create/open workspaces.
- The Pitch backend currently validates that `requested_by` ends with `@helix-law.com` / `@helix.law`.
- Do not put emails or enquiry IDs into the **workspace URL**.
  - The canonical workspace link is `/pitch/<passcode>`.

---

## 8) Acceptance criteria

1. From an Enquiry detail page, clicking the button opens `https://<pitch-host>/pitch/<passcode>`.
2. Re-clicking does not create duplicate workspaces unnecessarily (reuse behavior observed).
3. Basic error handling works (400/404/500 surfaced clearly).
4. (Optional) A document count can be displayed using the prospect docs list endpoint.

---

## 9) Notes for backend/ops (FYI)

- If the DB migration for `DealKind/EnquiryId/deal_id` isn’t applied yet, the ensure endpoint still works via fallbacks.
- Linking uploads to Deals improves once `prospect_docs.deal_id` exists.
