# Azure App Permissions Security Review

## 🚨 Issue Summary
Our two Azure app registrations have excessive permissions that pose security risks.

## Current State
- **aidenteams**: 47 permissions (global admin equivalent)
- **enquiry-aiden**: 53 permissions (global admin equivalent)

Both apps can:
- Access ANY user's email organization-wide
- Read/write ALL OneDrive/SharePoint files  
- Manage user accounts and Azure AD roles
- Install Teams apps for anyone

## Risk
If either app credential is compromised, attacker gains organization-wide access.

## Recommendation
Audit and reduce permissions to minimum required for each app's actual function.

## Next Steps
1. Review what permissions each app actually needs
2. Create new apps with minimal permissions
3. Migrate functionality to least-privilege apps
4. Retire over-permissioned apps

**Priority**: High (security compliance)

---

## Proposed Secure Architecture

Replace mega-apps with purpose-specific apps:

- **teamhub-outgoing** - Mail.Send only (email service)
- **direct-email-processor** - Mail.Read only (inbox search)  
- **instruction-email-service** - Mail.Read + Files.Read (attachments)
- **hunter-platform-handler** - External APIs (minimal Graph access)

**Benefits**: Same token flow, vastly reduced blast radius, compliance-friendly