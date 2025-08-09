---
applyTo: "**/*.ts,**/*.tsx"
---

# TypeScript Authoring Standards (Expanded)

These rules layer on top of repository root guidance. Keep diffs minimal and focused.

## Core Principles
* Always compile with strict settings (already enforced). Treat new implicit any warnings as blockers.
* Avoid `any`. If you must temporarily use it, add a `// TODO(date): narrow type` with owner initials.
* Prefer `unknown` at boundaries (I/O, `JSON.parse`, external libs) then narrow with user-defined type guards.
* Functions should be small, pure, and side‑effect free unless clearly named otherwise.

## Naming & File Conventions
* Files: `camelCase.ts`; React components: `PascalCase.tsx` (one component per file when exported publicly).
* Tests live next to source: `thing.test.ts` or `Thing.test.tsx`.
* Avoid gratuitous `index.ts` barrels unless it genuinely improves DX and does not create circular refs.

## Types & Interfaces
* Use `interface` for object shapes meant to be extended / merged; use `type` for unions, mapped, conditional, or function signatures.
* Exported types must be explicitly named (no anonymous export inline).
* Use discriminated unions over boolean flags: `kind: 'draft' | 'final'` beats `isDraft: boolean`.
* Prefer readonly where mutation is not required: `readonly` arrays / props help catch bugs.
* Never widen errors: preserve specific error types (see Error Handling below).

## Generics
* Name generics descriptively: `<TRecord extends Record<string, unknown>>` over `<T>` when it clarifies intent.
* Constrain generics to the minimum necessary to express requirements; don't over-constrain early.
* Provide default generic parameters when the common case is obvious.

## Error Handling
* Do not throw raw strings. Throw `Error` (or a narrow subclass) with actionable messages – omit secrets & PII.
* For expected validation issues, return a typed `Result` object: `{ ok: true, value } | { ok: false, error: ValidationError }` to avoid try/catch noise in calling code.
* Narrow caught errors: `if (err instanceof SomeLibError) { ... }` else wrap: `throw new Error("XYZ failed", { cause: err })`.

## Async & Promises
* Avoid `Promise.then` chains in application code—use `async/await`.
* Do not forget to `await` side-effectful calls (lint should help). Intentional fire‑and‑forget must be documented with a comment including why no await and error strategy.
* Race patterns: use `Promise.all` for independent calls; handle partial failure explicitly.

## Imports & Module Boundaries
* Absolute or path alias imports only if configured; otherwise keep relative depth shallow.
* Side-effect imports must be clearly commented (e.g., polyfills).
* Avoid circular dependencies—if required, factor shared contracts into a smaller leaf module.

## React / TSX Specific
* Components are pure functions. Derive state; avoid duplicating derived data in `useState`.
* Strongly type props via `interface Props { ... }`; export the props type only if reused elsewhere.
* Prefer `React.FC` omission; explicitly type children if needed: `children?: React.ReactNode`.
* Custom hooks: prefix with `use`, keep them pure (except allowed React side effects), and return stable shapes (objects with consistent keys or tuples with documented order).
* Memoization: Use `useMemo` / `useCallback` sparingly—only for expensive computations or to maintain referential stability for dependencies.

## Data Schema (Matters & Enquiries)
* Always prefer the NEW schema (snake_case and/or UPPERCASE forms). Do NOT introduce new dependencies on legacy spaced-key fields.
* Normalize incoming data via `src/utils/matterNormalization.ts` (add tests if you extend it).
* When adding schema-related code, include at least one test demonstrating round‑trip normalization.

## Testing Guidelines
* Minimum: happy path + one edge case for each exported function of moderate complexity.
* Use Jest; for React use Testing Library—assert on user-observable outcomes, not implementation details.
* Add type-level regression tests when fixing a bug: a test that would have failed previously.
* Prefer deterministic tests; if randomness is needed, seed it.

## Performance
* Guard large list operations: avoid O(n^2) when n could exceed ~1k. Consider maps / indexing.
* Memoize expensive derived selectors; document complexity in a brief JSDoc note if > O(n).
* Defer non-critical work with `requestIdleCallback` (with fallback) or chunk using `setTimeout` for large batches on the client.

## Security & Secrets
* Never log secrets or tokens. Scrub before logging (`redact()` helper if available / create one if repeating logic emerges).
* Validate all external inputs at the boundary; create narrow runtime validators (e.g., zod / custom guards) before use.

## Documentation / JSDoc
Add JSDoc to:
* Exported functions, types, interfaces.
* Complex internal utilities (heuristics, caches, memoization). 

Example:
```ts
/**
 * Fetch normalized matter records.
 * @param source Raw upstream payload (unknown boundary type).
 * @returns Normalized matters (new schema) or a structured error Result.
 */
export function normalizeMatters(source: unknown): Result<Matter[]> { /* ... */ }
```

## Pull Request Hygiene
* Keep PRs ≤ ~400 lines net change when possible; split if larger.
* Include a short checklist in the PR description: types added, tests added/updated, schema impact, perf considerations.
* If introducing new third-party deps, justify (size, maintenance, security posture) briefly.

## Incremental Migration Strategy
* When touching a legacy module: add a TODO block summarizing migration gap & create/augment an issue.
* Prefer adapter pattern over pervasive edits when consuming legacy shapes (thin wrapper translating to new schema early).

## Quick Checklist Before Commit
1. Types narrowed (no stray `any`).
2. Error paths covered & tested.
3. New schema only (normalized early).
4. Tests added / updated & pass locally.
5. No unexpected console logs.
6. Performance considerations noted (if relevant).

## Recent Learning Points (Chronological – newest first)
* 2025-08-09: Expanded baseline TS standards & collaborative learning section (init).

## Contribution Chain – Add Your Learning Point
For the next contributor: append one concise bullet under "Recent Learning Points" with:
`* YYYY-MM-DD: <Your insight / gotcha / micro-pattern> (<initials>)`
Examples:
* Prefer `satisfies` for const object type conformance without widening. (AB)
* Use a branded type for IDs crossing trust boundaries. (CD)

Each new bullet should teach a subtle, concrete lesson—not generic advice. Keep under 100 chars.

---
Original concise rules (still apply):
* Use TypeScript strict mode. Avoid `any`; prefer `unknown` and proper narrowing.
* Name files in camelCase; React components in PascalCase.
* Export types with explicit names; prefer interfaces for objects and types for unions.
* Add JSDoc to exported symbols and complex functions.
