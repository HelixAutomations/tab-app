# Brief Refinement Protocol

Last verified: 2026-06-09

Use when the operator pastes a rough brief, meaning anything beyond a one-line direct command, unless they say `just do it`, `skip refinement`, or `no plan`.

## Procedure

1. Read the files the brief most likely touches.
2. Reply with a refined brief using the template below. Cite real file paths and line numbers.
3. Score specificity, boundedness, and repo-fit from 0 to 10.
4. Wait for confirmation or amendment.
5. Move into Plan-First using the refined brief as the source of truth.

## Template

Omit sections that genuinely do not apply.

1. Goal: one crisp outcome sentence.
2. In scope: concrete deliverables with cited file paths.
3. Out of scope: what not to touch this pass.
4. Repo context loaded: files, lines, instruction docs actually read.
5. Conventions to honour: only the relevant ones.
6. Expected output shape: files, UX behaviour, API surface.
7. Verification: manual path, route smoke, telemetry, focused diagnostics.
8. Mechanisms to invoke: changelog, stash, telemetry, sync, guards.
9. Open questions: at most two, only if blocking.

Why: refining against the repo before planning prevents silent guesses.
