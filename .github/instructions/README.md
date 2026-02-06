# Instruction Files Index

This directory contains architectural and reference documentation for the Helix Hub application. These documents are designed to help AI agents and developers quickly understand the system structure, data flows, and integration patterns.

---

## Document Purpose

Each document focuses on a specific aspect of the system:

| Document | Purpose | When to Use |
|----------|---------|-------------|
| **DATABASE_SCHEMA_REFERENCE.md** | Database tables, fields, relationships, and query patterns | Working with Instructions/Matters tables, writing SQL queries, understanding data model |
| **CLIO_API_REFERENCE.md** | Clio API integration, authentication, endpoints, and constraints | Integrating with Clio, creating clients/matters, troubleshooting API errors |
| **ARCHITECTURE_DATA_FLOW.md** | System architecture, data flows, integration points, redundant code | Understanding overall system design, identifying cleanup opportunities, performance optimization |
| **TEAM_DATA_REFERENCE.md** | Team table schema, rate structure, dual-database sync | Updating rates, adding team members, understanding fee earner data |
| **WORKSPACE_OPTIMIZATION.md** | Cleanup priorities, automation scripts, code patterns | Starting cleanup work, understanding preferred patterns, session hygiene |

---

## Quick Reference

### Common Tasks

**Task**: Query instructions missing matter data  
**Reference**: `DATABASE_SCHEMA_REFERENCE.md` → "Find Instructions Missing Matter Data"

**Task**: Create Clio client from instruction data  
**Reference**: `CLIO_API_REFERENCE.md` → "Create New Client" + "Data Mapping"

**Task**: Understand instruction-matter workflow  
**Reference**: `ARCHITECTURE_DATA_FLOW.md` → "Data Flow: Instructions & Matters"

**Task**: Fix Clio API error  
**Reference**: `CLIO_API_REFERENCE.md` → "Error Handling" + "Troubleshooting Checklist"

**Task**: Identify redundant code  
**Reference**: `ARCHITECTURE_DATA_FLOW.md` → "Redundant Code & Cleanup Opportunities"

**Task**: Update fee earner rates  
**Reference**: `TEAM_DATA_REFERENCE.md` → "Rate Update Procedure"

**Task**: Start cleanup/optimization session  
**Reference**: `WORKSPACE_OPTIMIZATION.md` → "Cleanup Priorities" + "Session Cleanup Checklist"

---

## Document Maintenance

These documents are **living documentation** - update them when:
- Schema changes occur
- New API constraints are discovered
- Architecture patterns evolve
- Redundant code is removed

To keep the system from getting cluttered:
- Prefer updating existing instruction files over creating new ones.
- If a doc is stale and not used, delete it rather than polishing it.
- If you discover a non-adjacent improvement, add it to `ROADMAP.md` instead of doing it mid-task.
- Behavioural rules for agents belong in `.github/copilot-instructions.md`.

**Location**: `.github/instructions/`  
**Format**: Markdown with clear headings for easy navigation

---

## Key Insights Summary

### Database
- Instructions.ClientId and Instructions.MatterId are NULL until matter opening completes
- Matters table can have multiple placeholder records (Status='MatterRequest') per instruction
- Join Instructions ← Matters on InstructionRef to get matter data
- Use PascalCase field names (new schema), not spaced keys (legacy)

### Clio API
- Per-user credentials stored in Key Vault: `{initials}-clio-v1-{credential}`
- Person type requires first_name/last_name; Company type requires name
- Phone/address names must be: Work, Home, Billing, or Other
- Refresh tokens are single-use and rotate on each auth request
- EU region API: `https://eu.app.clio.com/api/v4`

### Architecture
- Frontend: React + Fluent UI + Teams SSO
- Backend: Azure Functions v4 + Azure SQL + Clio API
- Matter opening workflow is the ONLY normal path to populate ClientId/MatterId
- Placeholder Matters records created on instruction submission, updated on matter opening
- Legacy schema references exist but database uses new schema

---

## Related Files

**Project Documentation**:
- `README.md` - Project overview and getting started
- `LOCAL_DEVELOPMENT_SETUP.md` - Local dev environment setup
- `DEPLOYMENT_CHECKLIST.md` - Production deployment guide
- `.github/copilot-instructions.md` - AI coding guidelines

**Code References**:
- `server/routes/instructions.js` - Instructions backend logic
- `server/routes/matter-operations.js` - Clio integration and matter management
- `src/tabs/instructions/` - Instructions frontend components
