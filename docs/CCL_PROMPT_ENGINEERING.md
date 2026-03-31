# CCL Prompt Engineering Reference

Operational reference for the Client Care Letter AI generation and Safety Net (pressure test) scoring system.

## Architecture Overview

```
Client opens CCL modal
  → Auto-trigger AI fill (useEffect)
    → POST /api/ccl-ai/fill
      → gatherFullContext() — DB lookups across Instructions + Core Data + Deals + PitchContent
      → buildUserPrompt() — assembles context into structured prompt
      → chatCompletion(SYSTEM_PROMPT, userPrompt, { temperature: 0.2 })
      → Response: { fields, confidence, dataSources, durationMs }
    → If full confidence → auto-approve all fields
    → Store result in cclAiResultByMatter[matterId]
  → Auto-trigger Safety Net (useEffect, fire-and-forget)
    → POST /api/ccl-ai/pressure-test
      → gatherFullContext() — same DB context
      → gatherVerificationEvidence() — emails, call transcripts, documents
      → buildPressureTestUserPrompt() — generated fields + all evidence
      → chatCompletion(PT_SYSTEM_PROMPT, userPrompt, { temperature: 0.1 })
      → Response: { fieldScores, flaggedCount, totalFields, dataSources }
    → Store result in cclPressureTestByMatter[matterId]
    → Flagged fields surface inline in review rail
```

## Generation Prompt (`server/routes/ccl-ai.js`)

### System Prompt

The system prompt (`SYSTEM_PROMPT`, ~L195) instructs the AI as a senior UK solicitor at Helix Law. Key sections:

1. **Identity**: Senior UK solicitor, SRA-regulated firm, four practice areas
2. **Template context**: Shows exactly how each `{{placeholder}}` appears in the real letter template — the AI sees the surrounding sentences so it generates text that reads naturally in-situ
3. **Cost accuracy rules**: Five mandatory rules ensuring deal/pitch amounts are respected:
   - Deal Amount = agreed fee → payment on account must match
   - Pitch Email figures → charges estimate must match verbatim
   - No deal/pitch → mark as low confidence, use practice area norms
   - Never contradict agreed amounts
   - `state_amount` must equal `figure`
4. **Output format**: JSON only, no markdown, no explanation

### User Prompt Builder

`buildUserPrompt()` assembles context from `gatherFullContext()`:

| Source | Data gathered |
|--------|--------------|
| Instructions DB | InstructionRef, Notes, Stage, ClientType, CompanyName, Phone, Email |
| Deals table | ServiceDescription, Amount, Status, PitchedBy |
| PitchContent table | Pitch email body, service description, pitch amount |
| Core Data DB | Enquiry notes, area of work |
| Team data | Handler name, role, hourly rate, supervising partner |

### Temperature

- Generation: `0.2` (low creativity, high fidelity to evidence)
- Pressure test: `0.1` (even lower — pure verification, no creative latitude)

### Confidence Levels

| Level | Meaning | Auto-behaviour |
|-------|---------|----------------|
| `full` | All fields populated from AI | Auto-approve all fields in review |
| `partial` | Some fields from AI, some from defaults | Manual review needed |
| `fallback` | AI failed, all fields from practice area defaults | Manual review needed |

## Practice Area Defaults (`PRACTICE_AREA_DEFAULTS`)

Fallback values when AI generation fails or returns incomplete fields. Defined per practice area:

| Practice Area | Key | Costs Range | Payment on Account |
|--------------|-----|-------------|-------------------|
| Commercial | `commercial` | £2,500–£5,000 | £2,500 |
| Property | `property` | £1,500–£3,000 | £1,500 |
| Employment | `employment` | £1,500–£3,000 | £1,500 |
| Construction | `construction` | £3,000–£7,500 | £3,000 |
| Dispute Resolution | `dispute-resolution` | £2,000–£5,000 | £2,000 |

Each practice area defines all 20+ template fields with sensible fallbacks. These are only used when the AI cannot generate a field — the AI output always takes priority.

## Safety Net / Pressure Test

### Scoring Model

The pressure test is a second AI pass that verifies generated fields against source evidence.

**Reviewable fields** (`PRESSURE_TEST_REVIEWABLE_FIELD_KEYS`, ~L1416): 21 fields are scored. Auto-filled metadata fields (client name, handler details) are excluded.

**Scoring scale**:

| Score | Meaning |
|-------|---------|
| 10 | Perfectly matches source data |
| 8–9 | Strongly supported, minor wording preference |
| 7 | Mostly correct, some aspect uncertain |
| 6 | Plausible but weak evidence; may be generic |
| ≤5 | Likely hallucinated, contradicts evidence, or unsupported |

**Flag threshold**: Score ≤ 7 → `flag: true` → requires fee earner review.

If the AI doesn't score a field at all, it defaults to score 5, flagged, with reason "Verification AI did not return a score for this field".

### Evidence Gathering

`gatherVerificationEvidence()` (~L1592) collects:

| Source | Limit | Method |
|--------|-------|--------|
| Inbound emails | 5 | `/api/searchInbox` (Graph API) |
| Outbound emails | 5 | `/api/searchInbox` (Graph API) |
| Call transcripts | 5 | Dubber API → CallRail fallback |
| Documents | 20 | `/api/documents/{instructionRef}` |

Plus all original context from `gatherFullContext()` (pitch email, deal data, enquiry/instruction notes).

### Prompt Structure

The verification prompt (`buildPressureTestUserPrompt`, ~L1489) is structured:

```
=== GENERATED CCL FIELDS (to verify) ===
field_key: field_value
...

=== SOURCE EVIDENCE ===
--- PITCH EMAIL BODY ---
...
--- INITIAL CALL NOTES ---
...
--- INBOUND EMAILS ---
...
--- OUTBOUND EMAILS ---
...
--- CALL TRANSCRIPTS ---
...
--- DOCUMENTS ON FILE ---
...

=== INSTRUCTIONS ===
Score every generated field. Flag any scoring 7 or below.
Pay special attention to:
- £ amounts matching deal/pitch data exactly
- Scope matching what was actually discussed
- Document requests being specific, not generic
- Timescales being realistic
```

## Field Pipeline

### Adding a New Field

When adding a new template field to the CCL:

1. **Schema**: Add to `src/app/functionality/cclSchema.js` (tokens list)
2. **Sections**: Add to `src/tabs/matters/ccl/cclSections.ts` (UI section + field config)
3. **Field prompts**: Add to `src/tabs/matters/ccl/cclFieldPrompts.ts` (AI prompt instruction metadata)
4. **System prompt**: Add template context to `SYSTEM_PROMPT` in `server/routes/ccl-ai.js`
5. **Practice area defaults**: Add fallback values to `PRACTICE_AREA_DEFAULTS`
6. **Pressure test**: Add key to `PRESSURE_TEST_REVIEWABLE_FIELD_KEYS` if the field should be verified
7. **Word template**: Add `{{field_key}}` placeholder to the `.docx` template

### Key Files

| File | Purpose |
|------|---------|
| `server/routes/ccl-ai.js` | Generation + pressure test endpoints, prompts, defaults |
| `server/routes/ccl.js` | CCL CRUD, status derivation, document upload |
| `server/utils/cclPersistence.js` | DB persistence (CclContent, CclAiTrace tables) |
| `server/utils/aiClient.js` | Azure OpenAI client wrapper |
| `src/tabs/matters/ccl/cclAiService.ts` | Client-side API service (types + fetch wrappers) |
| `src/tabs/matters/ccl/cclFieldPrompts.ts` | Field-level prompt metadata for the refinement sidebar |
| `src/tabs/matters/ccl/cclSections.ts` | UI section definitions + field config |
| `src/app/functionality/cclSchema.js` | Template token registry |

## Known Edge Cases

| Issue | Cause | Mitigation |
|-------|-------|-----------|
| `may_will` defaults to "may" | Most matters don't have confirmed court proceedings | AI only outputs "will" when evidence explicitly confirms proceedings |
| Costs figures contradict deal | AI ignores deal amount and generates from practice area norms | System prompt has 5 cost accuracy rules; PT catches mismatches |
| Generic document requests | AI falls back to practice area defaults instead of matter-specific | PT flags when document names don't match what's actually on file |
| Scope too vague | Insufficient enquiry/call notes for the AI to work with | PT score ≤6 triggers flag; `gatherVerificationEvidence` checks communications |
| Disbursements table format | AI sometimes generates markdown tables instead of prose | System prompt updated to explicitly say "Avoid tables, repeated placeholder rows, or generic filler" |
| `state_amount` ≠ `figure` | Two fields that must always match but AI sometimes diverges | System prompt rule: "state_amount MUST always equal figure" |

## Prompt Modification Guidelines

When modifying prompts:

1. **Check PT scoring model** — if you change what a field should contain, the PT scoring criteria may also need updating
2. **Test with multiple practice areas** — defaults vary significantly between commercial vs property vs employment
3. **Preserve cost accuracy rules** — these are the most critical section; deal/pitch amounts must flow through unchanged
4. **Keep temperature low** — generation at 0.2, verification at 0.1. Higher temperatures cause hallucination in financial fields
5. **Update field prompts** — `cclFieldPrompts.ts` documents each field's purpose for the refinement sidebar; keep it in sync with the system prompt
