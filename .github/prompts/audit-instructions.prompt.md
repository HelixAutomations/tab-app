---
description: "Re-verify instruction estate against repo"
---

# Audit Instructions

Re-verify that every `.github/instructions/` file and `.github/copilot-instructions.md` still matches the live repo. Catches drift between always-on context and the code agents will actually touch.

## Procedure

1. **Run the validator**: `npm run validate:customizations`. Note every `error` (must fix) and `warn` (recommend fix or stash).
2. **Open the Chat Customizations Evaluations panel** in VS Code. Confirm no diagnostics on `copilot-instructions.md`, the four `*.instructions.md` files, or any `*.prompt.md`.
3. **Spot-check the high-traffic surfaces** for drift against source. For each item, open the live file in parentheses and confirm the instruction text still matches:
   - Communication Frameworks list ([server/prompts/communication-frameworks.js](../../server/prompts/communication-frameworks.js))
   - User Tiers table ([src/app/admin.ts](../../src/app/admin.ts))
   - Brand palette + AoW colours ([src/app/styles/colours.ts](../../src/app/styles/colours.ts))
   - Database lookup one-liners ([tools/instant-lookup.mjs](../../tools/instant-lookup.mjs))
   - Matter opening replay ([tools/run-matter-oneoff.mjs](../../tools/run-matter-oneoff.mjs))
   - App Insights helper surface ([server/utils/appInsights.js](../../server/utils/appInsights.js))
4. **Check `Last verified:` dates**. Any line older than 90 days flagged by the validator MUST be re-verified before quoting in this audit.
5. **Look for false-shipped references**: lines that say "ships at X", "lives at Y", "implemented in Z" where the path doesn't exist. Validator now errors on these (`false-shipped-reference`).
6. **Look for duplicate section titles** inside `copilot-instructions.md` (validator warns).

## Report shape

```
## Audit YYYY-MM-DD

- [ ] <file>: <what drifted> — <suggested fix or "stash">
```

Do not fix anything in this pass. Report only. The user decides which items become immediate edits, which become stash briefs, and which become roadmap items.
