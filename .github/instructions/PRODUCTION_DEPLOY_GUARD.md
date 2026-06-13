# Production Deploy Guard

Last verified: 2026-06-09

Use this file only when the user asks for a production deploy or production runtime mutation.

## Hard rule

Never run a production deploy or production runtime mutation without the confirmation menu below. This includes `build-and-deploy.ps1`, raw `az webapp deploy` against production, and runtime/config changes such as `az webapp config set` or `az webapp restart` for the production app.

Trigger phrases:

- `deploy prod`
- `deploy production`
- `ship prod`
- `push prod`
- `run production deploy`
- `cut over production runtime`
- `switch production to node 22`

When triggered, ask exactly this menu before doing anything mutable:

```text
Pick one:
0) No prod action
1) Check prod/staging status only
2) Deploy staging only
3) Deploy production code
4) Production runtime cutover only
```

After the user picks, run exactly one:

- `0`: do nothing
- `1`: read-only prod/staging checks only, no deploy, no restart, no config mutation
- `2`: `./build-and-deploy-staging.ps1`
- `3`: two-step passcode flow below
- `4`: only the explicitly requested production runtime mutation after option 4 and the passcode flow below

## Two-step passcode flow for options 3 and 4

The production deploy script requires three arguments and will refuse to run otherwise: `-ConfirmedByChat`, `-ConfirmationPhrase "DEPLOY PROD"`, and `-Passcode <value>`.

The agent does not know the passcode and must not guess, hard-code, store, or re-use it. The operator is the only source.

Every time:

1. Ask in chat: `Confirm: run the production deploy now? (yes / no)`. If anything other than an affirmative reply, stop.
2. Ask in chat: `Please paste the production deploy passcode. I will pass it straight to the script and not store it.`
3. Run: `./build-and-deploy.ps1 -ConfirmedByChat -ConfirmationPhrase "DEPLOY PROD" -Passcode "<value the user just supplied>"`.
4. Never echo, log, write, store, infer, document, or re-use the passcode.

If the user says `deploy` casually or as part of a broader sentence, the menu is still required before any production mutation.
