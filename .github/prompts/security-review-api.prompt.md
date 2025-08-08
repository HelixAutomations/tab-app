---
mode: agent
model: auto
tools: ["vscode.git","vscode.search","vscode.workspace","copilot.codeEdits"]
description: Perform a focused security review on an Azure Functions HTTP endpoint.
---

Goal
- Review the specified Azure Functions handler for common web API security issues.

Inputs
- Function file: ${input:functionFile:api/src/functions/getMatters.ts}
- Threat focus (optional): ${input:focus:auth, validation, secrets, SQL}

Process
1) Inspect the handler and any helper imports in the same folder.
2) Check for: input validation, CORS, secret handling, SQL parameterization, error handling, logging, and auth.
3) Produce findings with severity and specific file:line references.
4) Propose minimal code changes, keeping public API stable.

Output
- Summary
- Findings (High/Med/Low) with rationale
- Suggested patches (small diffs)
- Test plan
