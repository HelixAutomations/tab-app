# Copilot custom instructions for this workspace

These instructions guide AI responses for this repository. They apply to all chat-based code generation.

Project context
- Stack: React 18 + TypeScript (strict), Azure Functions (Node 18/20) with @azure/functions v4, TeamsFx, Fluent UI, Jest.
- Structure: Frontend under `src/`; Azure Functions under `api/src/functions`; auxiliary `decoupled-functions` project; local Azurite.

Data schema policy (Matters)
- Primary: Use the NEW schema moving forward. Prefer vnet/new-service shapes (snake_case like `matter_id`, `display_number`) and the newer UPPERCASE forms (e.g., `MatterID`, `DisplayNumber`).
- Legacy: Spaced-key legacy fields (e.g., `"Display Number"`, `"Unique ID"`) are DEPRECATED. Do not introduce new dependencies on them.
- Normalization: Route all new work via `src/utils/matterNormalization.ts`. If you must touch raw shapes, add tests and update the docs.
- Caution: This area is under migration. Read `docs/matters-schema.md` before editing. Prefer `vnet_direct` as the dataSource.
- Direction of travel: consolidate on the new schema and phase out `legacy_all`/spaced keys.

General guidelines
- Prefer TypeScript-first implementations; no `any`. Use `unknown` and narrow.
- Keep functions small and pure. Avoid hidden I/O. Return typed results and never throw plain strings.
- Add JSDoc to exported functions and complex types.
- Follow security-by-default: parameterize SQL, never log secrets, use `DefaultAzureCredential` + Key Vault for prod.
- Keep diffs focused; avoid unrelated refactors.

React/TS
- Use functional components, hooks, and React 18 patterns. Enable `react-jsx` and strict TS.
- Prefer `@fluentui/react-components` (v9) for new UI; keep v8 usages as-is when editing existing code.
- Co-locate component-specific types and tests next to components.

Azure Functions (Node)
- Use the v4 programming model: `app.http(...)` with a separate typed handler.
- Always handle CORS and OPTIONS preflight for browser callers.
- Read config from env first; fall back to Key Vault in production; never hardcode secrets.
- Use robust error handling: return 4xx for validation errors, 5xx for server errors.

Testing
- Use Jest and Testing Library for React; use integration-style tests for Functions where practical.
- Cover happy path plus at least one edge case per public function.

Performance & DX
- Avoid O(n^2) on large lists. Use memoization for expensive selectors.
- Keep build-compatible with CRA/react-scripts.
