# Privacy and ZDR Rules

Last verified: 2026-06-09

Use this file when touching any surface that can reach client data: Asana, Clio, Instructions DB, Core Data DB, Graph mail, Teams DMs, document blobs, deal capture, CCL pipelines, enquiry intake, or instruct-pitch onboarding.

## Hard rules for this chat agent

- Treat the chat surface as untrusted for raw client PII.
- Do not paste, summarise, restate, or quote raw client names, emails, phone numbers, addresses, DOBs, payment refs, matter narratives, free-text notes, or any text written by or about a client into chat replies, plans, changelog entries, instruction docs, or stash briefs.
- Do not run scripts, route smokes, or subagents that pull live client content to verify behaviour. Verify shape from docs, fixtures, types, structural metadata, ids, counts, hashes, and status codes only.
- Telemetry, ops logs, error strings, console output, and summaries must carry structural metadata only.
- When debugging a route that touches client data, ask the operator for the id/gid. Do not fetch and paste the body.
- `.copilotignore` is not a privacy control. Use runtime guards and operator discipline.
- When uncertain, default to denial and ask the operator before proceeding.

## Required pattern for new client-data readers

If code can return client content, add a hard consent gate before returning it. Reference implementation: `server/utils/asanaContentGuard.js`.

Required pieces:

1. `assertOperatorReadConsent({ operatorConsent, operatorActor }, '<callerLabel>')` style gate that fails closed without consent.
2. Every reader function on that surface wires through the gate.
3. A `safeXSummary(obj)` helper returns only structural metadata.
4. A single loud escape-hatch env flag for local development only. Do not commit scripts that set it.
5. A matching `.github/instructions/<surface>-content-guard.instructions.md` covering readers, callers, scripts, and tools.

Currently guarded surface: Asana task content via `server/utils/asanaContentGuard.js` and `asana-task-content-guard.instructions.md`.
