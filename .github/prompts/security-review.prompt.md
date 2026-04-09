---
description: "Security review of the current file or recent changes"
---

# Security Review

Audit the current file or recent changes against OWASP Top 10 and Helix-specific rules:

1. **Injection** — SQL injection (non-parameterised queries), XSS (unsanitised HTML), command injection
2. **Authentication** — missing auth checks on routes, token leakage, session handling
3. **Sensitive data** — secrets in code, PII in logs, credentials in error messages
4. **Access control** — `isAdminUser()` vs `isDevOwner()` misuse, missing role checks
5. **Configuration** — CORS misconfiguration, debug endpoints in production, verbose errors
6. **Dependencies** — known vulnerable packages, outdated security-critical deps

For each finding:
- **Severity**: Critical / High / Medium / Low
- **Location**: file + line
- **Issue**: what's wrong
- **Fix**: specific remediation

Critical and High findings should be fixed immediately. Medium/Low can be parked in ROADMAP.md.
