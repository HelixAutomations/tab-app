# Helix Hub v1 - Teams App
*Legal Services Platform for Microsoft Teams*

## 🚀 Quick Start for New Agents

**PRIORITY**: Execute database cleanup to remove 67% test data noise.  
**See**: [`docs/PLATFORM_OPERATIONS.md`](docs/PLATFORM_OPERATIONS.md) for 5-minute setup.

### Current State (Oct 1, 2025)
- ✅ **Teams Mobile Fix**: ECONNRESET errors resolved with enhanced connection pooling
- ✅ **Connection Resilience**: Health checks, queue timeouts, and retry logic implemented
- ✅ **Pill System**: Interactive status pills with expandable details implemented
- ✅ **Risk Display**: Fixed color coding (green for low risk, not red)
- ✅ **Email Updates**: Deal capture notifications sent to lz@helix-law.com
- ✅ **Unified API**: Instructions loading optimized via `/api/instructions` endpoint
- ✅ **Architecture**: Documented and stable (see `/docs` folder)
- ⚠️ **Database**: 45 records with 30 test noise records ready for cleanup
- ⚠️ **Luke Test**: Health indicator preserved at `HLX-27367-94842`

### Recent Updates

#### October 1, 2025 - Teams Mobile Connection Fix
- ✅ **ECONNRESET Resolution** - Fixed database connection errors affecting Teams mobile users
- ✅ **Enhanced Pooling** - Increased concurrency from 6 to 25 parallel requests
- ✅ **Health Monitoring** - Automatic connection validation every 2 minutes
- ✅ **Queue Protection** - 30s timeout prevents indefinite request waiting
- ✅ **Mobile Optimization** - Reduced timeouts for faster mobile client failures
- 📖 **See**: [`docs/TEAMS_MOBILE_FIX_SUMMARY.md`](docs/TEAMS_MOBILE_FIX_SUMMARY.md)

#### September 9, 2025
- ✅ **Pill Functionality** - Interactive status pills replace action tabs
- ✅ **Expandable Details** - Click completed pills to view detailed information
- ✅ **Document Integration** - Documents clickable within detail sections
- ✅ **Smart Interactions** - Next action pills trigger actions, completed pills show details

### Important Documentation
- **� [Teams Mobile Fix Summary](docs/TEAMS_MOBILE_FIX_SUMMARY.md)** - Connection error resolution
- **⚡ [Azure Config Quick Reference](docs/AZURE_CONFIG_QUICK_REFERENCE.md)** - Deployment guide
- **�📋 [Instructions Reference](docs/INSTRUCTIONS_REFERENCE.md)** - Fast track for next agent
- **📊 [Database Analysis](docs/INSTRUCTIONS_DATABASE_ANALYSIS.md)** - Complete technical details
- **🏗️ [Architecture Analysis](ARCHITECTURE_ANALYSIS.md)** - System overview

### Instructions Tab Status
The Instructions tab now correctly separates:
- **Pitches Tab**: 161 unconverted deals (potential clients)
- **Clients Tab**: 6 actual instructions (converted clients)

## Overview of the Teams Tab App template

The Teams Tab app template is a Hello World app for Microsoft Teams. It can help you get started with your first Teams app and it can be a base for creating more complex apps.

### Key Features
- **Instructions Management**: Unified endpoint for client instruction data
- **Enquiry Processing**: Automated enquiry capture and routing  
- **Document Handling**: Secure document storage and management
- **Workflow Automation**: Streamlined legal processes
- **Teams Integration**: Native Microsoft Teams experience

This app uses [On-Behalf-Of flow](https://learn.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-on-behalf-of-flow) for SSO and Azure Functions as middleware for authenticated Microsoft Graph requests.

## Get started with the React with Fluent UI template

> **Prerequisites**
>
> To run the command bot template in your local dev machine, you will need:
>
> - [Node.js](https://nodejs.org/), supported versions: 18, 20
> - A [Microsoft 365 account for development](https://docs.microsoft.com/microsoftteams/platform/toolkit/accounts)
> - [Set up your dev environment for extending Teams apps across Microsoft 365](https://aka.ms/teamsfx-m365-apps-prerequisites)
>   Please note that after you enrolled your developer tenant in Office 365 Target Release, it may take couple days for the enrollment to take effect.
> - [Teams Toolkit Visual Studio Code Extension](https://aka.ms/teams-toolkit) version 5.0.0 and higher or [Teams Toolkit CLI](https://aka.ms/teamsfx-toolkit-cli)

1. First, select the Teams Toolkit icon on the left in the VS Code toolbar.
2. In the Account section, sign in with your [Microsoft 365 account](https://docs.microsoft.com/microsoftteams/platform/toolkit/accounts) if you haven't already.
3. Press F5 to start debugging which launches your app in Teams using a web browser. Select `Debug in Teams (Edge)` or `Debug in Teams (Chrome)`.
4. When Teams launches in the browser, select the Add button in the dialog to install your app to Teams.
5. To load the sample data used for local development, set `REACT_APP_USE_LOCAL_DATA=true` before starting the app.
6. To mock Key Vault credentials locally, set `USE_LOCAL_SECRETS=true` and define variables in your `.env` file using the secret name with hyphens replaced by underscores.
   You can copy `.env.example` to `.env` as a starting point.
   For example:

   ```env
   USE_LOCAL_SECRETS=true
   AC_AUTOMATIONS_APITOKEN=token
   LZ_CLIO_V1_CLIENTID=id
   LZ_CLIO_V1_CLIENTSECRET=secret
   LZ_CLIO_V1_REFRESHTOKEN=refresh
   ```
7. To refresh the local attendance dataset with dummy values, ensure the API server is running then run `npm run generate:attendance`.
8. To refresh risk, compliance and ID verification data for the dashboard, run `npm run generate:risk` and `npm run generate:tiller`.
9. To regenerate the POID records derived from instructions, run `npm run generate:idverifications`.
10. To create sample snippet edit requests for local testing, run `npm run generate:snippets`.
11. Sample transactions and outstanding balances are provided when using local data.
12. When running the Azure Functions backend locally, ensure a storage emulator like [Azurite](https://github.com/Azure/Azurite) is running. Otherwise set the `AzureWebJobsStorage` environment variable to a valid Storage connection string so the Functions runtime can acquire its host lock.

**Congratulations**! You are running an application that can now show a beautiful web page in Teams, Outlook and the Microsoft 365 app.

![Personal tab demo](https://github.com/OfficeDev/TeamsFx/assets/63089166/9599b53c-8f89-493f-9f7e-9edae1f9be54)

## What's included in the template

| Folder       | Contents                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `.vscode`    | VSCode files for debugging                                                                                             |
| `appPackage` | Templates for the Teams application manifest                                                                           |
| `env`        | Environment files                                                                                                      |
| `infra`      | Templates for provisioning Azure resources                                                                             |
| `src`        | The source code for the frontend of the Tab application. Implemented with Fluent UI Framework.                         |
| `api`        | The source code for the backend of the Tab application. Implemented single-sign-on with OBO flow using Azure Functions. |

The following are Teams Toolkit specific project files. You can [visit a complete guide on Github](https://github.com/OfficeDev/TeamsFx/wiki/Teams-Toolkit-Visual-Studio-Code-v5-Guide#overview) to understand how Teams Toolkit works.

| File                 | Contents                                                                                                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `teamsapp.yml`       | This is the main Teams Toolkit project file. The project file defines two primary things: Properties and configuration Stage definitions.                                                                                                               |
| `teamsapp.local.yml` | This overrides `teamsapp.yml` with actions that enable local execution and debugging.                                                                                                                                                                   |
| `aad.manifest.json`  | This file defines the configuration of Microsoft Entra app. This template will only provision [single tenant](https://learn.microsoft.com/azure/active-directory/develop/single-and-multi-tenant-apps#who-can-sign-in-to-your-app) Microsoft Entra app. |

## Extend the React with Fluent UI template

Following documentation will help you to extend the React with Fluent UI template.

- [Add or manage the environment](https://learn.microsoft.com/microsoftteams/platform/toolkit/teamsfx-multi-env)
- [Create multi-capability app](https://learn.microsoft.com/microsoftteams/platform/toolkit/add-capability)
- [Use an existing Microsoft Entra application](https://learn.microsoft.com/microsoftteams/platform/toolkit/use-existing-aad-app)
- [Customize the Teams app manifest](https://learn.microsoft.com/microsoftteams/platform/toolkit/teamsfx-preview-and-customize-app-manifest)
- Host your app in Azure by [provision cloud resources](https://learn.microsoft.com/microsoftteams/platform/toolkit/provision) and [deploy the code to cloud](https://learn.microsoft.com/microsoftteams/platform/toolkit/deploy)
- [Collaborate on app development](https://learn.microsoft.com/microsoftteams/platform/toolkit/teamsfx-collaboration)
- [Set up the CI/CD pipeline](https://learn.microsoft.com/microsoftteams/platform/toolkit/use-cicd-template)
- [Publish the app to your organization or the Microsoft Teams app store](https://learn.microsoft.com/microsoftteams/platform/toolkit/publish)
- [Enable the app for multi-tenant](https://github.com/OfficeDev/TeamsFx/wiki/Multi-tenancy-Support-for-Azure-AD-app)
- [Preview the app on mobile clients](https://github.com/OfficeDev/TeamsFx/wiki/Run-and-debug-your-Teams-application-on-iOS-or-Android-client)

## Architecture Overview

This application uses a unified API architecture to efficiently serve instruction data:

### Data Flow
1. **Frontend** (React on port 3000) requests instruction data
2. **Express Server** (port 8080) receives requests and routes to appropriate services
3. **VNet Azure Functions** (in Azure Virtual Network) access production database
4. **Production Database** (Azure SQL) stores all instruction, deal, and document data

### Key Features
- **Unified Instruction Endpoint**: Single API call (`/api/instructions`) replaces multiple separate calls
- **VNet Integration**: Database access through Azure Virtual Network for security
- **Environment-Driven Configuration**: Use `REACT_APP_USE_LOCAL_DATA=false` to access production data
- **Server-Side Processing**: Business logic and data transformation handled by Express server

### Environment Configuration
- Production data: `REACT_APP_USE_LOCAL_DATA=false` (default)
- Local test data: `REACT_APP_USE_LOCAL_DATA=true`
- VNet function authentication via `INSTRUCTIONS_FUNC_CODE` environment variable

### Security: Do NOT expose Function keys in frontend
- Frontend must not reference `REACT_APP_*_CODE` or call Function URLs with `?code=...`.
- Always call server routes under `/api/...`; the Express server uses Key Vault or env to call Functions.
- Configure CORS for production via `ALLOWED_ORIGINS` (comma-separated) so only trusted origins are allowed.

Migration plan (summary):
1) Replace any frontend `fetch` that includes `?code=` with an equivalent `/api/...` route.
2) If a route doesn’t exist, add a proxy in `server/routes` that reads the key from Key Vault (or env) and forwards the request.
3) Remove `REACT_APP_*_CODE` from client env and rotate exposed keys.

## Local development flow (concise)

Topology
- React dev server (http://localhost:3000) → Express API (http://localhost:8080) under `/api/*`.
- Unified routes: `/api/matters-unified` (direct MSSQL with TTL cache), `/api/instructions` (unified instructions).
- Fallbacks (only when Express is down or a route is missing):
  - TypeScript Azure Functions at http://localhost:7072 (folder `api`)
  - Decoupled Functions at http://localhost:7071 (folder `decoupled-functions`)

Start locally
- VS Code task: “Start Teams App Locally” (runs prerequisites → provision → deploy → start frontend/backend).
- Or run tasks individually:
  - “Start frontend” → `npm run dev-tab:teamsfx` (background)
  - “Watch backend” → watches `api` functions (background)
  - “Start backend” → `npm run dev:teamsfx` (Express) (background)

Ports/CORS
- Functions Core Tools: do not set `cors` in `api/host.json`.
- Local CORS is configured via `api/local.settings.json` under `Host: { CORS, CORSCredentials }` to allow 3000/8080.

Deprecations
- `/api/getAllMatters` is removed (410 Gone). Use `/api/matters-unified`.
- Frontend must not call Function URLs with `?code=`; always call Express `/api/...` routes.

Troubleshooting
- ECONNREFUSED to 8080: backend not running → start “Start backend”.
- 410 Gone for `/api/getAllMatters`: update callers to `/api/matters-unified`.
- CORS error from Functions: ensure `api/host.json` has no `cors` key and `api/local.settings.json` Host.CORS includes `http://localhost:3000` and `http://localhost:8080`.

## Deployment

When deploying to Azure Web Apps on Windows, build the project first so that the root directory contains `index.js` and the compiled React files. The provided [build-and-deploy.ps1](build-and-deploy.ps1) script automates this by running the build, copying the server files and their dependencies along with `web.config`, and then zipping the result for deployment. Deploying the repository directly without building will result in a 500 error because IIS cannot locate `index.js` or the required Node modules.

Once built you can also run the server locally using:

```bash
npm start
```

This starts the Express server which serves the built application from the root folder.

## Draft CCL Workflow

The Draft Client Care Letter (CCL) feature lets you automatically produce a branded Word document for a matter.

Draft CCL lives alongside Overview & Risk in the matter-opening tabs. Partners & Solicitors will see a **Draft CCL** tab where they can edit, save, generate and download the CCL.
Navigation: `Instructions ▸ Draft CCL`.

### API

* `POST /api/ccl` – generate a new CCL. Payload `{ matterId, draftJson }`.
* `GET /api/ccl/:matterId` – retrieve the latest draft JSON and download URL.
* `PATCH /api/ccl/:matterId` – regenerate the Word file after editing the JSON.

Generated files are stored under `public/ccls` and served statically. The matter opening workflow includes a **Generate Draft CCL** step which calls this API and surfaces the resulting download link. Each generation overwrites the previous file.

Example payload using the merge-field schema from `src/app/functionality/cclSchema.js`:

```json
{
  "matterId": "123",
  "draftJson": {
    "insert_clients_name": "ACME Ltd",
    "insert_heading_eg_matter_description": "Share purchase",
    "matter": "HLX-00001-12345",
    "name_of_person_handling_matter": "Jane Doe",
    "status": "Solicitor",
    "names_and_contact_details_of_other_members_of_staff_who_can_help_with_queries": "John Example <john@example.com>",
    "insert_current_position_and_scope_of_retainer": "Initial advice",
    "next_steps": "Draft agreement",
    "realistic_timescale": "2 weeks",
    "estimate": "Fixed fee",
    "figure": "1000",
    "next_stage": "Exchange",
    "we_cannot_give_an_estimate_of_our_overall_charges_in_this_matter_because_reason_why_estimate_is_not_possible": "TBC"
  }
}
```

Manual entry is required for:

* `names_and_contact_details_of_other_members_of_staff_who_can_help_with_queries`
* `insert_current_position_and_scope_of_retainer`
* `next_steps`
* `realistic_timescale`
* `estimate`
* `figure`
* `next_stage`
* `we_cannot_give_an_estimate_of_our_overall_charges_in_this_matter_because_reason_why_estimate_is_not_possible`

Token mapping:

| Token | Source |
| ----- | ------ |
| `insert_clients_name` | `poid.prefix` + first + last if available, otherwise `company_details.name` |
| `insert_heading_eg_matter_description` | `matter_details.description` |
| `matter` | `matter_details.matter_ref` → fallback to `instruction_ref` → fetch `/api/matters/:id` and use `display_number` |
| `name_of_person_handling_matter` | `team_assignments.fee_earner` |
| `status` | role of the fee earner from `localUserData` |
| `names_and_contact_details_of_other_members_of_staff_who_can_help_with_queries` | combined string of fee earner, originating solicitor and supervising partner with emails |
| `identify_the_other_party_eg_your_opponents` | first opponent name if provided |
| `email` | email of the fee earner |
| `insert_current_position_and_scope_of_retainer` | manual entry |
| `next_steps` | manual entry |
| `realistic_timescale` | manual entry |
| `estimate` | manual entry |
| `figure` | manual entry |
| `next_stage` | manual entry |
| `we_cannot_give_an_estimate_of_our_overall_charges_in_this_matter_because_reason_why_estimate_is_not_possible` | manual entry |

If the `/api/matters/:id` request fails, `instruction_ref` is used as the `matter` value.

Quick demo using `curl`:

```bash
curl -X POST http://localhost:8080/api/ccl \
  -H "Content-Type: application/json" \
  -d '{"matterId":"123","draftJson":{"insert_clients_name":"ACME","insert_heading_eg_matter_description":"Share purchase","matter":"HLX-00001-12345","name_of_person_handling_matter":"Jane Doe","status":"Solicitor"}}'
```
