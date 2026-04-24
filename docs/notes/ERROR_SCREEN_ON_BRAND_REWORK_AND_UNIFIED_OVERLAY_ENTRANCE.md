# Error screen on-brand rework and unified overlay entrance

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-22 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

<1–3 short paragraphs. Quote the user verbatim where possible. State what the request is and what the user is *not* asking for.>

---

## 2. Current state — verified findings

<For every claim, cite a file path and line number. No memory-based assertions.>

### 2.1 <subsystem / area>

- File: [path/to/file.ts](../../path/to/file.ts) — what it currently does
- Notable line refs: L###, L###

### 2.2 <next subsystem>

…

---

## 3. Plan

### Phase A — <small, independently shippable correction>

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | … | [path](../../path) | … |
| A2 | … | … | … |

**Phase A acceptance:** <bullet list of observable outcomes>

### Phase B — <larger architectural piece>

#### B1. <component>

<DDL, function signatures, data flow — whatever a future agent needs>

#### B2. <next component>

…

---

## 4. Step-by-step execution order

1. **A1** — <action>
2. **A2** — <action>
3. *(parallel with 4)* **B1** — <action>
4. *(parallel with 3)* **B2** — <action>
5. …

---

## 5. Verification checklist

**Phase A:**
- [ ] <observable outcome>
- [ ] <observable outcome>

**Phase B:**
- [ ] <observable outcome>
- [ ] App Insights events: `<EventName.Started/Completed/Failed>` visible
- [ ] SQL spot check: `<query>`

---

## 6. Open decisions (defaults proposed)

1. **<decision>** — Default: **<recommended option>**. Rationale: <one line>.
2. **<decision>** — Default: **<recommended option>**.

---

## 7. Out of scope

- <item>
- <item>

---

## 8. File index (single source of truth)

Client:
- [path](../../path) — purpose

Server:
- [path](../../path) — purpose

Scripts / docs:
- `path` (NEW) — purpose
- [logs/changelog.md](../../logs/changelog.md) — entry per phase

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: error-screen-on-brand-rework-and-unified-overlay-entrance                          # used in INDEX cross-refs
verified: 2026-04-22
branch: main
touches:
  client: []
  server: []
  submodules: []                  # any path under submodules/** here
depends_on: []                    # ids that must ship FIRST
coordinates_with: []              # ids that touch the same files but don't block
conflicts_with: []                # ids that mutate the same regions — will need merge
```

---

## 9. Gotchas appendix

<The non-transferable residue. Things you only spot by tracing the code in this session. Examples:>

- `<file>` line N uses `event.stopPropagation()` on the inner Edit click — preserve that when restructuring or the parent row's onClick will fire.
- `<helper>` looks like a one-liner but has hidden side effects in <other file>.
- The `<seemingly-obvious-fix>` was tried before and reverted in commit `<sha>` because <reason>.
