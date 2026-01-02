# Roadmap

Tracked priorities for future sessions. Any agent can pick these up.

---

## High Priority

- [ ] **Containerise deployment** - Current `build-and-deploy.ps1` is slow and error-prone. Move to Docker containers for consistent, fast deploys. Investigate Azure Container Apps or AKS.

## Medium Priority

- [ ] **Audit docs/ folder** - 113 files, mostly stale. Sift through, keep useful ones, delete rest
- [ ] **Consolidate duplicate SQL patterns** - Multiple files do similar DB queries differently
- [ ] **Standardise error handling** - Mix of patterns across server routes
- [ ] **Clean console.logs** - Replace with proper logging where needed

## Low Priority

- [ ] **Audit decoupled-functions/** - Only 2 of ~15 functions actually used (fetchInstructionData, recordRiskAssessment). Consider migrating to server routes or deleting unused
- [ ] **Remove commented-out code** - Scattered across codebase
- [ ] **Consistent naming conventions** - snake_case vs camelCase inconsistency

---

## Completed

- [x] 2025-12-30: Agent infrastructure (sync-context, session-start, validate-instructions)
- [x] 2025-12-30: 2025 rate update (both databases)
- [x] 2025-12-30: Root cleanup (removed temp files)
- [x] 2025-12-30: Archived one-off scripts

---

*Update this file when priorities shift or items complete.*
