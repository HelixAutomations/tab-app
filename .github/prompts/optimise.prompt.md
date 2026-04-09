---
description: "Identify performance optimisation opportunities in the current file or component"
---

# Optimise

Analyse the current file/component for performance improvements:

1. **Render efficiency** — unnecessary re-renders, missing memoisation, anonymous closures in JSX
2. **Data fetching** — unbounded fetches, missing pagination, N+1 patterns, stale cache
3. **Bundle impact** — large imports that could be lazy-loaded or code-split
4. **Memory leaks** — uncleared intervals/timeouts, dangling subscriptions, growing arrays
5. **CSS/layout** — layout thrashing, forced reflows, expensive selectors

For each finding, state:
- **What**: the specific issue
- **Where**: file + line range
- **Impact**: estimated severity (low/medium/high)
- **Fix**: concrete suggestion

Prioritise high-impact, low-risk changes. Flag anything that requires broader refactoring.
