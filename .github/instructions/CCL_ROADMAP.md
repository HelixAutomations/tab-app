# CCL (Client Care Letter) — Architecture Reference

> "The UX should be review of a finished Word doc — user shouldn't see building blocks."  
> — Alex Cook, June 2025

## Architecture (Current)

### Entry points

| Surface | Entry | Status |
|---------|-------|--------|
| **Home** (primary) | `OperationsDashboard` CCL strip → full-screen review modal | ✅ Active |
| **Matters** (context) | `MatterOverview` → "Open CCL Editor" → `CCLEditor` | ✅ Active |
| ~~Instructions path~~ | ~~Post-matter-opening prompt → DocumentsV3~~ | 🗑 Retired |

The Instructions-side CCL surface was retired. `DocumentsV3.tsx`, `CCLPreview.tsx`, `TemplateEditorStep.tsx`, `TemplateSelectionStep.tsx`, `PresetPanel.tsx`, `PreviewActionsStep.tsx`, `HoverTooltip.tsx`, `placeholderStyles.ts`, and `utils/templateParser.ts` have all been deleted. `CCLWorkbench.tsx` (orphaned) was also deleted.

### File map

| File | Purpose |
|------|---------|
| `src/components/modern/OperationsDashboard.tsx` | Home surface — imports `DocumentRenderer` + `cclAiService`, owns AI fill + pressure test pipeline |
| `src/tabs/instructions/ccl/DocumentRenderer.tsx` | Kept — renders live doc for Home modal |
| `src/tabs/matters/ccl/CCLEditor.tsx` | Matters context editor — A4 preview, sidebar, download |
| `src/tabs/matters/ccl/PreviewStep.tsx` | AI status banner, unfilled fields summary |
| `src/tabs/matters/ccl/QuestionnaireStep.tsx` | Fallback questionnaire (hidden by default) |
| `src/tabs/matters/ccl/EditorStep.tsx` | Fallback field editor (hidden by default) |
| `src/tabs/matters/ccl/cclAiService.ts` | Client-side fetch wrappers for /api/ccl-ai/* |
| `src/tabs/instructions/ccl/utils/templateUtils.ts` | Kept — re-exported by `src/shared/ccl/templateUtils.ts` |
| `src/app/functionality/cclSchema.js` | 31 token schema |
| `server/routes/ccl.js` | CRUD + download (.docx via wordGenerator) |
| `server/routes/ccl-ai.js` | AI fill (POST /fill) and pressure test (POST /pressure-test) |
| `server/routes/ccl-ops.js` | Ops panel — approve, reject, audit |
| `server/routes/ccl-admin.js` | Admin controls |
| `server/routes/ccl-date.js` | Date helpers |
| `server/utils/aiClient.js` | Azure OpenAI singleton, Key Vault auth |
| `docs/CCL_PROMPT_ENGINEERING.md` | Full AI pipeline reference — read before editing prompts |

### AI pipeline

```
Home surface (OperationsDashboard):
  → POST /api/ccl-ai/fill     { matterId, practiceArea, ... }
    → gatherEnquiryContext() from Core Data + Instructions DB
    → Azure OpenAI (gpt-4o) → 26 intake fields
    → confidence: full → auto-approve; partial / fallback → queue for review
  → POST /api/ccl-ai/pressure-test
    → second AI pass scores each field 0-10 against email/call evidence
    → fields ≤7 flagged orange in review rail; ≥8 pass with green dot

Matter context (CCLEditor):
  → autoFillFromMatter() — 15 handler/client fields from matter + teamData
  → POST /api/ccl-ai/fill on mount — 26 intake fields
  → User reviews A4 preview, edits via sidebar, downloads .docx
```

### Access control

Gated by `isCclUser()` in `src/app/admin.ts`. Currently: `CCL_USERS = ['LZ', 'AC']`.

---

## What's done

| Feature | Location |
|---------|---------|
| A4 paper preview (794×1123px) | `CCLEditor / PreviewStep` |
| Letterhead + recipient block | `DocumentRenderer` |
| Sidebar: Sections / Quick Edit / Presets | `PreviewStep` sidebar |
| `autoFillFromMatter()` — 15 handler/client fields | `CCLEditor` |
| Rate map (Partner £395, Assoc £325, Sol £285, Trainee £195) | `cclAiService` |
| Download .docx | `server/routes/ccl.js` → `wordGenerator.js` |
| AI fill — 26 intake fields on entry | `ccl-ai.js` / `cclAiService.ts` |
| AI status banner (loading / complete / partial / fallback / error) | `PreviewStep` |
| Unfilled fields summary badge | `PreviewStep` sidebar |
| Practice area defaults (commercial, property, employment, construction, dispute) | `ccl-ai.js` |
| Context gathering from Core Data + Instructions DB | `ccl-ai.js` |
| AI pressure test — field scoring 0-10 | `ccl-ai.js` → `OperationsDashboard` |
| Approval flow — approve / reject / flag | `ccl-ops.js` |
| Home surface — per-matter CCL strip + review modal | `OperationsDashboard` |

---

## Remaining work

| # | Item | Priority |
|---|------|----------|
| 1 | Inline blank highlighting — yellow-highlight unfilled merge fields on A4 | ⬜ Next |
| 2 | Remove step indicators — no "Step 1/2/3" chrome in CCLEditor | ⬜ Next |
| 3 | Schema consolidation — 31 tokens in `cclSchema.js` + 16 EXTRA_TOKENS in `ccl.js` + template fields in `wordGenerator.js` fragmented | ⬜ Next |
| 4 | Action points — AI generates matter-specific action points | ⬜ Future |
| 5 | Correspondence analysis — AI reads email threads for scope/timelines | ⬜ Future |


| `src/components/PreviewStep.tsx` | Blank highlighting, sidebar blank summary |
| `src/constants/cclSections.ts` | Practice area defaults map |
| `server/routes/ccl.js` | Pull pitch/instruction data for auto-fill |

### Files to Create (Phase 2)

| File | Purpose |
|------|---------|
| `server/utils/aiClient.js` | Azure OpenAI singleton client |
| `server/routes/ccl-ai.js` | AI generation endpoint |
| `server/prompts/ccl-scope.txt` | System prompt template |
| `src/services/cclAiService.ts` | Client-side AI service calls |

### Key Vault Secrets (already provisioned)
- `azure-openai-api-key` — same key used by enquiry-processing-v2

### enquiry-processing-v2 AI Patterns (Reference)

Located in `submodules/enquiry-processing-v2/Services/AiClassificationService.cs` (1200 lines):
- 6 AI methods: delegation classification, forwarded email extraction, reply sentiment, info@ classification, name extraction (×2)
- All use: system prompt → user message → JSON response format → typed DTO parsing
- Fallback chain: AI → keyword analysis → safe default
- Singleton client with SemaphoreSlim double-check locking
- Tracking IDs for end-to-end traceability
- Body truncation (2000 chars) for implicit token control
- No retry logic (should add for CCL)
- No token/cost tracking (should add for CCL)

---


