---
description: "Run a health check on files touched in this session"
---

# Health Check

Scan every file modified in this session for:

1. **Dead imports** — imported but never used
2. **Unused variables** — declared but never read
3. **Functions >80 lines** — candidates for extraction
4. **Duplicated logic** — same helper exists elsewhere in the codebase
5. **Missing error handling** — try/catch absent at system boundaries
6. **Performance anti-patterns** — unnecessary re-renders, N+1 queries, unbounded fetches
7. **Security concerns** — unsanitised input, exposed secrets, missing auth checks
8. **File size** — approaching or exceeding 3,000 lines

Report findings in this format:

```
- [ ] `path/to/file.tsx`: description of issue — suggested action
```

Do not fix anything — report only. The user decides what to act on.
