# Workspace Optimization Guide

## Philosophy

This project has evolved organically. New code should follow these principles:

1. **Single source of truth** - No duplicate data/logic
2. **Self-documenting** - Code structure reveals intent
3. **Automated hygiene** - Scripts handle repetitive cleanup
4. **Progressive cleanup** - Each session leaves codebase better

Operating constraint (prevents clutter): deliver the user request first; only do cleanup/hygiene work when it is directly adjacent and low-risk. Anything else goes in `ROADMAP.md`.

---

## Directory Structure Intent

```
helix-hub-v1/
├── .github/
│   ├── copilot-instructions.md    # Agent behavior rules
│   └── instructions/              # Domain knowledge for agents
├── api/                           # Azure Functions (v4)
├── database/migrations/           # SQL changes with documentation
├── docs/                          # Human-readable documentation
├── tools/                         # Reusable ops scripts (tracked)
├── scripts/                       # Local-only scratch (excluded from git)
├── server/                        # Express backend (main: index.js)
│   ├── routes/                    # API endpoints
│   └── utils/                     # Shared utilities
├── src/                           # React frontend
│   ├── components/                # Reusable UI components
│   ├── tabs/                      # Main feature areas
│   └── utils/                     # Frontend utilities
└── submodules/                    # External dependencies
```

---

## Cleanup Priorities

Actionable cleanup items are tracked in `ROADMAP.md` (same folder) to maintain a single source of truth. The items below are kept here only as pattern guidance — for the actual task list, see ROADMAP.

### Patterns to watch for
- Duplicate SQL query patterns → standardise around `withRequest` from `server/utils/db.js`
- Unused routes → grep registrations vs frontend `fetch()` calls
- Inconsistent error handling → adopt try/catch with structured JSON responses
- Stray `console.log` → replace with proper logging or remove

---

## Automation Scripts

### Health Checks
```bash
# Find unused exports
npm run lint -- --rule 'no-unused-vars: warn'

# Find duplicate code
npx jscpd src/ --min-lines 10 --reporters console

# Check for large files (>500 lines)
find src -name "*.tsx" -exec wc -l {} + | sort -rn | head -20
```

### Cleanup Helpers
```bash
# Remove console.logs (dry run)
grep -rn "console.log" src/ --include="*.tsx" --include="*.ts"

# Find TODO/FIXME comments
grep -rn "TODO\|FIXME\|HACK" src/ server/
```

---

## Code Patterns to Prefer

### Database Queries
```javascript
// ✅ Use withRequest from utils/db.js
const result = await withRequest(connectionString, async (request) => {
  return request.query`SELECT * FROM table WHERE id = ${id}`;
}, retries);

// ❌ Avoid raw connection management
```

### API Routes
```javascript
// ✅ Consistent error handling
router.get('/', async (req, res) => {
  try {
    const data = await fetchData();
    return res.json(data);
  } catch (error) {
    console.error('[routeName] Error:', error);
    return res.status(500).json({ error: 'Description' });
  }
});
```

### React Components
```javascript
// ✅ Named exports, typed props
export const MyComponent: React.FC<MyComponentProps> = ({ prop1, prop2 }) => {
  // ...
};
```

---

## Prospects Component (`src/tabs/enquiries/Enquiries.tsx`)

This is the largest and most complex frontend file. Key knowledge for agents:

### Data flow
1. **Props** → `enquiries` (array from parent) enters via prop
2. **Normalisation** → `useEffect` maps raw props through `normalizeEnquiry()` into `allEnquiries` state
3. **Team-wide fetch** → `fetchAllEnquiries` callback fetches full dataset into `teamWideEnquiries` state (for All/Claimed views)
4. **Display derivation** → `useEffect` picks `allEnquiries` or `teamWideEnquiries` based on `showMineOnly` toggle → `displayEnquiries`
5. **Filtering** → `filteredEnquiries` useMemo (~350 lines) applies area, search, pipeline, POC, person filters
6. **Enrichment** → Progressive enrichment fetches Teams/pitch/instruction data per-record into `enrichmentMap`

### Dual schema
Two database sources feed this component. `normalizeEnquiry()` in `src/utils/normalizeEnquiry.ts` maps both to canonical PascalCase fields. The `__sourceType` tag (`'new'` | `'legacy'`) lets downstream code branch when needed.
- **New schema** (instructions-db): lowercase keys — `id`, `datetime`, `aow`, `poc`, `claim`
- **Legacy schema** (core-data-db): PascalCase — `ID`, `Area_of_Work`, `Point_of_Contact`, `Date_Created`

### Pipeline filter buttons (header row)
The header has 7 tri-state filter buttons: POC, Pitch, Instruction, EID Check, Payment, Risk, Matter. Each cycles: **no filter → has (green) → missing (red) → clear**. State lives in `enquiryPipelineFilters` Map. A carousel system shows/hides buttons based on available width via ResizeObserver.

### Key patterns and traps
- `displayEnquiries` is **stateful** (not derived) — 13 `setDisplayEnquiries` call sites, 3 of which update `displayEnquiries` without updating `teamWideEnquiries` (optimistic claim/area/rating handlers). Converting to `useMemo` requires adding `setTeamWideEnquiries` to those 3 handlers first.
- Inline `InlineWorkbench` is rendered per-row when expanded — it handles the full instruct pipeline (pitch, EID, risk, matter opening, payments).
- `recentUpdatesRef` overlays fresh server responses onto normalised data to avoid stale-cache flicker after mutations.

---

## Files to Watch

These files are frequently modified and may accumulate cruft:

| File | Watch For |
|------|-----------|
| `server/index.js` | Unused route imports |
| `src/components/App.tsx` | Unused component imports |
| `package.json` | Unused dependencies |
| `.env.*` files | Stale/duplicate vars |

---

## Session Cleanup Checklist

Before ending a work session:

1. [ ] Remove any debug console.logs added
2. [ ] Delete temporary test files
3. [ ] Update relevant instruction files if patterns changed
4. [ ] Note any technical debt discovered in this file

---

## Discovered Technical Debt Log

| Date | Area | Issue | Priority |
|------|------|-------|----------|
| 2025-12-30 | database | Two team tables need sync | High |
| 2026-02-08 | frontend | Enquiries.tsx: 11k lines, 222+ hooks — see ROADMAP.md Prospects Optimisation Plan | High |
| 2026-02-08 | server | 3+ route files duplicate `tokenCache` + `getAccessToken` — see ROADMAP.md auth broker item | Medium |

*Add entries as you discover issues during work*
