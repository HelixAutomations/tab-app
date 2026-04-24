# Database index and dual-DB audit

> **Purpose of this document.** This is a self-contained brief that any future agent (or the user on a different day) can pick up cold and execute without prior context. Every relevant file path, line number, current-state finding, and decision is captured below.
>
> **How to use it.** Read the whole document once. Then implement Phase A. Phase B (and onwards) should be picked up only after A ships. Add a `logs/changelog.md` entry per phase.
>
> **Verified:** 2026-04-19 against branch `main`. If you're reading this more than 30 days later, re-verify file/line refs before executing.

---

## 1. Why this exists (user intent)

User quote (2026-04-19):

> *"separately, stash a brief for a comprehensive table index and dual db setup audit. i suspect there may be some calls that are still slowing us down massively, just with bad code and legacy paths? I might be wrong, but the app feels too laggy for a web app thats premium and connecting to a db in the same environment."*

The Hub talks to TWO Azure SQL databases (Instructions + Core Data) with overlapping concepts (matters / clients / users) sometimes synced, sometimes joined cross-DB by application code. There is no single source of truth on **which queries are hot, which are missing indexes, and where the dual-DB shape is causing avoidable round-trips**. Several index migrations exist (`scripts/migrate-add-all-indexes.mjs`, `scripts/migrate-add-collectedtime-indexes.mjs`) but no consolidated audit and no measured "top-N slowest queries" baseline.

The user's hypothesis is correct *as a question* — "premium app on same-env DB" should be sub-100ms for the hot path, and they suspect legacy/bad query patterns. This brief is the audit that either confirms or disproves that, then closes the gaps.

**Not in scope:** schema redesign (audit only — fixes are scoped per finding, big rewrites out); migrating to a single DB (organisationally complex; out); replacing SQL with Cosmos / NoSQL (no signal that's needed).

---

## 2. Current state — verified findings

### 2.1 Two databases, overlapping concepts

- **Instructions DB** (`INSTRUCTIONS_SQL_CONNECTION_STRING`) — Instructions, Deals, IdVerifications, etc. Owned by the instruct-pitch flow.
- **Core Data DB** (`SQL_CONNECTION_STRING`) — enquiries, matters, team, events, etc. Owned by tab-app.
- Some entities are **dual-written** (e.g. matters appear in both DBs after matter opening — verified in [`tools/run-matter-oneoff.mjs`](../../tools/run-matter-oneoff.mjs) workflow).
- Some queries **join across** the DBs at the application layer by fetching from one and looking up in the other (likely culprits: matter cards that show both Instruction stage and Matter status; reporting that mixes enquiries with deals).

Reference: [.github/instructions/DATABASE_SCHEMA_REFERENCE.md](../../.github/instructions/DATABASE_SCHEMA_REFERENCE.md) and [.github/instructions/ARCHITECTURE_DATA_FLOW.md](../../.github/instructions/ARCHITECTURE_DATA_FLOW.md).

### 2.2 Existing index work — partial

- `scripts/migrate-add-all-indexes.mjs` — verify what it actually adds; likely a focused set, not comprehensive.
- `scripts/migrate-add-collectedtime-indexes.mjs` — collected-time-specific.
- No scripts found for: enquiries, matters, instructions hot-path indexes per audit.

### 2.3 No measured baseline

App Insights tracks request duration server-side. SQL Server has `sys.dm_exec_query_stats` and Query Store (likely on; verify). Together they CAN tell us:

- Top 50 queries by total exec time (= count × avg duration).
- Top 50 by avg duration alone (the slow ones).
- Top 50 by reads/writes (the IO-heavy ones).
- Missing-index recommendations from `sys.dm_db_missing_index_details`.

Nothing in the codebase consolidates this into a per-environment report.

### 2.4 Cross-DB application joins are the obvious smell

N+1 risk pattern: fetch list of matters from Core Data → for each matter, fetch instruction stage from Instructions → render. With 200 matters that's 201 SQL round-trips. Unverified but suspicious.

Spot-check candidates: any route that mentions both `Matters` and `Instructions` tables. Search `server/routes/*.js` for both.

### 2.5 Connection pool behaviour

Verify: are pools per-DB shared across requests? Are there per-request connections being opened? `mssql` package's default pool config matters. See [server/utils/db.js](../../server/utils/db.js) (or wherever the connection is wrapped).

If a hot route opens a fresh connection per request instead of reusing the pool, that's a 50–200ms tax per request, hidden behind "the DB is slow".

---

## 3. Plan

### Phase A — measure (no code change)

Produce a 1-page report per DB with the following sections:

#### A1. Top-N slowest queries

```sql
-- Run on each DB. Captures average duration, total time, rows.
SELECT TOP 50
  qs.execution_count,
  qs.total_elapsed_time / 1000 AS total_ms,
  qs.total_elapsed_time / qs.execution_count / 1000 AS avg_ms,
  qs.total_logical_reads / qs.execution_count AS avg_reads,
  SUBSTRING(qt.text, qs.statement_start_offset/2 + 1,
           ((CASE qs.statement_end_offset WHEN -1 THEN DATALENGTH(qt.text) ELSE qs.statement_end_offset END
             - qs.statement_start_offset)/2) + 1) AS query_text
FROM sys.dm_exec_query_stats qs
CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) qt
WHERE qs.last_execution_time > DATEADD(day, -7, SYSUTCDATETIME())
ORDER BY qs.total_elapsed_time DESC;
```

Output to `exports/db-audit-{db}-top-queries.csv`.

#### A2. Missing-index recommendations

```sql
SELECT TOP 50
  d.statement AS table_name,
  s.avg_total_user_cost,
  s.avg_user_impact,
  s.user_seeks + s.user_scans AS uses,
  d.equality_columns,
  d.inequality_columns,
  d.included_columns
FROM sys.dm_db_missing_index_groups g
  INNER JOIN sys.dm_db_missing_index_group_stats s ON s.group_handle = g.index_group_handle
  INNER JOIN sys.dm_db_missing_index_details d ON g.index_handle = d.index_handle
ORDER BY (s.avg_total_user_cost * s.avg_user_impact * (s.user_seeks + s.user_scans)) DESC;
```

Output to `exports/db-audit-{db}-missing-indexes.csv`.

#### A3. Existing index inventory

```sql
-- Per table: which indexes, key columns, included columns, fragmentation.
SELECT t.name AS table_name, i.name AS index_name, i.type_desc,
       STRING_AGG(c.name, ',') WITHIN GROUP (ORDER BY ic.key_ordinal) AS key_cols
FROM sys.tables t
  INNER JOIN sys.indexes i ON i.object_id = t.object_id
  INNER JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
  INNER JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE i.is_hypothetical = 0 AND i.type > 0
GROUP BY t.name, i.name, i.type_desc
ORDER BY t.name, i.name;
```

Output to `exports/db-audit-{db}-existing-indexes.csv`.

#### A4. Cross-DB join inventory (codebase analysis)

Grep `server/routes/**/*.js` for files that import or query both `INSTRUCTIONS_SQL_CONNECTION_STRING` and `SQL_CONNECTION_STRING`. For each, document:

- Route path.
- Which entities are joined.
- Whether the join is N+1, single batch, or cached.
- Estimated frequency from App Insights `requests` dataset.

Output to `exports/db-audit-cross-db-joins.md`.

#### A5. Connection-pool sanity check

Read [server/utils/db.js](../../server/utils/db.js) (or whichever file wraps `mssql`):

- Are pools created once at module load? (Required.)
- What are the `max` / `min` / `idleTimeoutMillis` settings? (Document.)
- Does any route call `sql.connect(...)` directly instead of using the wrapper? (Anti-pattern; flag.)

Output to `exports/db-audit-pool-config.md`.

### Phase B — fix the top 3 findings

After A produces ranked findings, pick the top 3 by impact × ease. Each becomes its own micro-PR + changelog entry. Do NOT batch — each fix should be measurable in App Insights before/after.

Expected leading candidates (working hypothesis only — A actually picks):

1. **Cross-DB N+1 elimination** — convert any "fetch list, then per-row lookup in other DB" to either (a) cached snapshot of the joined dimension, refreshed via SSE, or (b) batch lookup `WHERE id IN (...)`.
2. **Missing composite index on hottest query.** A2 names the table+columns; the migration is one `CREATE INDEX` statement.
3. **Connection pool tuning.** If A5 finds `max: 10` against a route that fans out to 20 parallel queries, raise the pool size or serialize the fans.

### Phase C — durable monitoring

#### C1. Slow-query telemetry

Wrap `withRequest` (or the equivalent in [server/utils/db.js](../../server/utils/db.js)) so any query that exceeds a threshold (default: 250ms) emits an App Insights event `Db.SlowQuery` with sanitised query text + duration + DB. Single line of code, zero overhead for fast queries.

Add a Workbook panel showing slow-query count per route per day. This becomes the durable signal that prevents regression.

#### C2. Quarterly re-audit

Document the Phase A queries as runbook scripts in `tools/db-audit/` so a future agent re-runs the audit on schedule (or when a perf complaint comes in) without re-scoping.

---

## 4. Step-by-step execution order

1. **A1–A5** — run the queries / grep, populate `exports/db-audit-*`. Single PR with the report files.
2. **Read the report.** Pick top 3 by impact × ease.
3. **B1, B2, B3** — one PR each, in order of impact. Measure App Insights before/after.
4. **C1** — slow-query telemetry. Bake 1 week.
5. **C2** — runbook scripts.

---

## 5. Verification checklist

**Phase A:**
- [ ] CSV reports exist for both DBs in `exports/`.
- [ ] Cross-DB join inventory exists in `exports/`.
- [ ] Pool config documented.
- [ ] Top-3 fixes ranked with impact estimates.

**Phase B (per fix):**
- [ ] App Insights `requests` p95 for the affected route drops by ≥30%.
- [ ] SQL Server query exec count for the targeted query drops as expected.
- [ ] No regression in other routes (run the audit again, no new red flags).

**Phase C:**
- [ ] `Db.SlowQuery` events appear in App Insights for any query >250ms.
- [ ] Workbook shows slow-query trend per route.
- [ ] Runbook scripts produce same shape of report as Phase A on demand.

---

## 6. Open decisions (defaults proposed)

1. **Slow-query threshold** — Default: **250ms**. Rationale: well above normal hot-path; loud enough to surface real problems; quiet enough to not flood telemetry.
2. **Where to store the report** — Default: `exports/db-audit-YYYY-MM-DD/`. Rationale: gitignored exports folder already exists; date-stamped for trend.
3. **Whether to fix during the audit** — Default: **NO**. Audit first, decide second. Avoids confirmation bias on which problems are real.
4. **Cross-DB join strategy** — Default: **case-by-case** (cache vs batch vs deferred load). No single right answer.
5. **Index migration script naming** — Default: `scripts/migrate-add-{table}-indexes.mjs` per existing convention. Rationale: matches existing files.

---

## 7. Out of scope

- Schema redesign (table-by-table normalisation).
- Merging the two databases into one.
- Switching from Azure SQL to a different DB engine.
- Replication / read-replicas (premature; verify the read load first).
- Caching layer changes beyond what specific findings require (Redis is already in place).
- Application-side query rewriting beyond the top-3 fixes (queue rest as separate stash items if found).

---

## 8. File index (single source of truth)

Server:
- [server/utils/db.js](../../server/utils/db.js) — pool config audit + Phase C1 slow-query wrap
- Various `server/routes/*.js` — Phase B fixes (specific files determined by Phase A)

Scripts / docs:
- `tools/db-audit/run-audit.mjs` (NEW — Phase C2) — executes Phase A queries
- `tools/db-audit/missing-indexes.sql` (NEW)
- `tools/db-audit/top-queries.sql` (NEW)
- `tools/db-audit/existing-indexes.sql` (NEW)
- `scripts/migrate-add-{table}-indexes.mjs` (NEW per Phase B finding)
- `exports/db-audit-YYYY-MM-DD/` (NEW per audit run, gitignored)
- [logs/changelog.md](../../logs/changelog.md) — entry per phase
- [.github/instructions/DATABASE_SCHEMA_REFERENCE.md](../../.github/instructions/DATABASE_SCHEMA_REFERENCE.md) — update with finalised index inventory
- [.github/instructions/ARCHITECTURE_DATA_FLOW.md](../../.github/instructions/ARCHITECTURE_DATA_FLOW.md) — update with documented cross-DB join paths

### Stash metadata (REQUIRED — used by `check stash overlap`)

```yaml
# Stash metadata
id: database-index-and-dual-db-audit
verified: 2026-04-19
branch: main
touches:
  client: []
  server:
    - server/utils/db.js
    - server/routes/                 # Phase B (specific files TBD)
  submodules: []
depends_on: []
coordinates_with:
  - ui-responsiveness-hover-scroll-and-tab-navigation   # both attack the "app feels laggy" complaint from different ends (interaction vs data)
conflicts_with: []
```

---

## 9. Gotchas appendix

- **Don't trust `sys.dm_exec_query_stats` blindly.** It resets on server restart, plan-cache flush, recompile. Capture over a 7-day window minimum, ideally after a normal-load week.
- **Missing-index recommendations are heuristic.** SQL Server suggests indexes that would help individual queries, not necessarily the workload. Adding every recommendation is a guaranteed write-amplification disaster. Apply only the top ~3 per table, prefer composite over single-column.
- **`STRING_AGG` requires SQL Server 2017+.** If either DB is older, swap to `STUFF + FOR XML PATH`.
- **Query-text truncation.** `dm_exec_sql_text` returns the full batch, not just the parameterised statement. Use `qs.statement_start_offset` / `statement_end_offset` (as the example does) to extract just the slow piece.
- **Cross-DB joins via `linked server`** would be a third option for B1, but linked-server queries are notoriously slow and lock-prone. Stay in app-layer batching.
- **Connection pool `max` is per-process.** With multiple replicas (see [REALTIME_MULTI_REPLICA_SAFETY.md](./REALTIME_MULTI_REPLICA_SAFETY.md)), the effective pool is `max × replicas`. Don't tune blindly upward.
- **Some "slow" queries are slow because of locks, not work.** A `WAITSTATS` snapshot during the audit window distinguishes "this query is doing too much" from "this query is being blocked". Worth capturing.
- **Index changes can REGRESS performance.** Always measure the affected query before and after. SQL Server's plan cache may pick a worse plan with the new index until it re-optimises.
- **The user hypothesis ("legacy paths") is testable.** A2 will surface the actual culprits. Don't go hunting for stylistic legacy code unless A2 names it.
- **Premium-app perception is the goal, not raw ms.** A 50ms query that runs on every keystroke feels worse than a 500ms query that runs once on tab open. Weight findings accordingly.
