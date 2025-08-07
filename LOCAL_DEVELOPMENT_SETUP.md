# Local Development Setup

This document explains how to set up and run the Helix Hub application locally with all required services.

## Architecture Overview

The application consists of multiple services that need to run simultaneously:

1. **Azurite** - Local Azure storage emulator (ports 10000-10002)
2. **Decoupled Functions** - Azure Functions for data operations (port 7071)
3. **API Functions** - Legacy Azure Functions (port 7072)
4. **Express Server** - Backend API proxy and routing (port 8080)
5. **React Dev Server** - Frontend application (port 3000)

## Service Details

### Azurite (Storage Emulator)
- **Purpose**: Provides local Azure storage services (blob, queue, table)
- **Ports**: 10000 (blob), 10001 (queue), 10002 (table)
- **Required for**: Azure Functions host lock and storage operations

### Decoupled Functions (Port 7071)
- **Location**: `./decoupled-functions/`
- **Functions**: `fetchMattersData`, `fetchEnquiriesData`, etc.
- **Purpose**: Modern Azure Functions for database operations
- **Authentication**: Function keys from Azure Key Vault

### API Functions (Port 7072)
- **Location**: `./api/`
- **Functions**: `getMatters.ts`, `getMatterSpecificActivities.ts`, etc.
- **Purpose**: Legacy Azure Functions (TypeScript-based)
- **Authentication**: Function keys from Azure Key Vault

### Express Server (Port 8080)
- **Location**: `./server/`
- **Purpose**: Proxy requests between frontend and Azure Functions
- **Routes**: `/api/getMatters`, `/api/enquiries`, `/api/matters/:id`, etc.

### React Dev Server (Port 3000)
- **Location**: `./src/`
- **Purpose**: Frontend development server with hot reload
- **Proxies**: Configured to route API calls to Express server

## Request Flow Example

### Successful Flow (After Fix)
Frontend GET to `/getSnippetEdits?code=xxx`:
1. React Dev Server (3000) → Express Server (8080)
2. Express Server receives request with function code in query parameter
3. Express Server → API Functions (7072) `/api/getSnippetEdits?code=xxx`
4. API Function returns data (empty array if no data)
5. Express Server returns 200 status with data to frontend

### Matters Data Flow
Frontend POST to `/api/getMatters`:
1. React Dev Server (3000) → Express Server (8080)
2. Express Server extracts `fullName` from POST body
3. Express Server → Decoupled Functions (7071) `/api/fetchMattersData?fullName=...&code=...`
4. Decoupled Function queries database and returns data
5. Express Server returns data to frontend

## Fixed Issues

✅ **404 Errors**: Added comprehensive proxy routes for all Azure Functions
✅ **Port Routing**: Express server now correctly routes to ports 7071 and 7072
✅ **Function Keys**: Proxy uses codes provided by frontend instead of Key Vault lookup
✅ **CORS Headers**: Proper cross-origin headers configured

## Environment Requirements

- Node.js (version 16+)
- Azure Functions Core Tools v4
- Azure CLI (for authentication)
- Access to Azure Key Vault for function keys

## Manual Setup (for reference)

1. Start Azurite:
   ```bash
   npx azurite
   ```

2. Start Decoupled Functions:
   ```bash
   cd decoupled-functions
   func start --port 7071
   ```

3. Start API Functions:
   ```bash
   cd api
   func start --port 7072
   ```

4. Start Express Server:
   ```bash
   node server.js
   ```

5. Start React Dev Server:
   ```bash
   npm start
   ```

## Automated Setup

Use the provided npm scripts for easy startup:

```bash
# Start all services (recommended)
npm run dev:all

# Start only backend services
npm run dev:backend

# Start individual services
npm run dev:azurite
npm run dev:functions
npm run dev:api
npm run dev:server
```

## Troubleshooting

### Port Conflicts
- If ports are in use, kill existing processes:
  ```bash
  npx kill-port 7071 7072 8080 10000 10001 10002
  ```

### Azure Functions Host Errors
- Ensure you're in the correct directory with `host.json`
- Check that Azurite is running before starting Functions
- Verify Azure authentication: `az login`

### Function Key Errors
- Ensure you have access to the Azure Key Vault
- Check that the correct function key names are used in code
- Verify Key Vault permissions

### Database Connection Issues
- Check that environment variables or Key Vault secrets contain valid DB credentials
- Ensure database server is accessible from your network

## Development Notes

- **Hot Reload**: React dev server supports hot reload for frontend changes
- **Function Reload**: Azure Functions host automatically reloads on code changes
- **Express Reload**: Manual restart required for Express server changes
- **Port Assignment**: Keep port assignments consistent to avoid proxy issues

## Production Differences

In production:
- Azurite is replaced with actual Azure Storage
- Functions run in Azure Functions service
- Express server may run in Azure App Service or Container Apps
- React app is built and served statically

## Debugging

- **Frontend Issues**: Check browser dev tools and React dev server terminal
- **Express Issues**: Check Express server terminal output
- **Function Issues**: Check Azure Functions host terminal output
- **Database Issues**: Check function logs for SQL connection errors
