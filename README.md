# Overview of the React with Fluent UI template
# invisible change

This app showcases how to craft a visually appealing web page that can be embedded in Microsoft Teams, Outlook and the Microsoft 365 app with React and Fluent UI. The app also enhances the end-user experiences with built-in single sign-on and data from Microsoft Graph.

This repository is being refactored to support responsive design so that pages adapt gracefully on devices ranging from desktop browsers to tablets and mobile phones.

This app has adopted [On-Behalf-Of flow](https://learn.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-on-behalf-of-flow) to implement SSO, and uses Azure Functions as middle-tier service, and make authenticated requests to call Graph from Azure Functions.

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
7. To refresh the local attendance dataset with dummy values derived from `data/team-sql-data.json`, run `npm run generate:attendance`.
8. To refresh risk, compliance and ID verification data for the dashboard, run `npm run generate:risk` and `npm run generate:tiller`.
9. To regenerate the POID records derived from instructions, run `npm run generate:idverifications`.
10. To create sample snippet edit requests for local testing, run `npm run generate:snippets`.
11. Sample transactions and outstanding balances are provided when using local data.

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

## Server-side processing

This project now includes a lightweight Express server located in the `server` directory.
Start it locally with:

```bash
npm run start:server
```

When using Teams Toolkit for local debugging, the server starts automatically as
part of `npm run dev:teamsfx`.

The server exposes a `/health` endpoint for liveness checks and a `/process` endpoint
that streams basic progress events using Server-Sent Events. This provides a foundation
for adding real-time workflow updates after the "Submit Matter" button is pressed.

Token refresh endpoints for ActiveCampaign, Clio and Asana are documented in
[`docs/token-refresh.md`](docs/token-refresh.md).
## Deployment

When deploying to Azure Web Apps on Windows, build the project first so that the root directory contains `index.js` and the compiled React files. The provided [build-and-deploy.ps1](build-and-deploy.ps1) script automates this by running the build, copying the server files and their dependencies along with `web.config`, and then zipping the result for deployment. Deploying the repository directly without building will result in a 500 error because IIS cannot locate `index.js` or the required Node modules.

Once built you can also run the server locally using:

```bash
npm start
```

This starts the Express server which serves the built application from the root folder.