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
├── scripts/                       # Automation & one-off tasks
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

### High Priority (Technical Debt)
- [ ] Consolidate duplicate SQL query patterns
- [ ] Remove unused routes (check with grep)
- [ ] Standardize error handling patterns
- [ ] Clean up console.log → proper logging

### Medium Priority (Organization)
- [ ] Move one-off scripts to `scripts/archive/`
- [ ] Consolidate similar utilities
- [ ] Document undocumented env vars

### Low Priority (Polish)
- [ ] Consistent naming conventions
- [ ] Remove commented-out code
- [ ] Update stale documentation

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
| | | | |

*Add entries as you discover issues during work*
