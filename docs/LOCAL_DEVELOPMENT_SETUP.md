# Local Development Setup (Updated September 2025)

This document explains how to set up and run the Helix Hub application locally with the unified instruction data architecture.

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment for production data access
cp .env.example .env
# Edit .env to set REACT_APP_USE_LOCAL_DATA=false

# Start all services
npm run dev:all
```

## Architecture Overview

The application now uses a **unified API architecture** for instruction data:

1. **React Frontend** (port 3000) - Single API calls to unified endpoints  
2. **Express Server** (port 8080) - Proxies to VNet functions, handles business logic
3. **VNet Azure Functions** - Production database access within Azure Virtual Network
4. **Production Database** - Azure SQL Database with all instruction data

## Environment Configuration

### Production Data Access (.env)
```env
# Force production data instead of local test data
REACT_APP_USE_LOCAL_DATA=false

# VNet function authentication  
INSTRUCTIONS_FUNC_CODE=<your-azure-function-key>
INSTRUCTIONS_FUNC_BASE_URL=https://instructions-vnet-functions.azurewebsites.net/api/fetchInstructionData

# Azure Key Vault for secret management
KEY_VAULT_URL=https://helix-keys.vault.azure.net/
USE_LOCAL_SECRETS=false

# Production database connection (for VNet functions)
SQL_CONNECTION_STRING=Server=tcp:helix-database-server.database.windows.net,1433;Initial Catalog=helix-core-data;...
```

### Local Test Data (.env)
```env
# Use local test data for development
REACT_APP_USE_LOCAL_DATA=true

# Local secrets (optional for offline development)
USE_LOCAL_SECRETS=true
```

## Data Flow Architecture

### Unified Instruction Loading
```
Frontend Request: GET /api/instructions?includeAll=true
    ↓
Express Server: server/routes/instructions.js
    ↓  
VNet Function: instructions-vnet-functions.azurewebsites.net/api/fetchInstructionData
    ↓
Production Database: helix-database-server.database.windows.net
```

**Benefits:**
- ✅ Single API call replaces multiple separate requests
- ✅ Eliminates N+1 query problems and race conditions  
- ✅ Luke Test instruction (HLX-27367-94842) consistently visible
- ✅ Faster page loads and better performance

### Legacy Service Architecture (Still Available)

For other functionality, these services still run:

1. **Azurite** - Local Azure storage emulator (ports 10000-10002)
2. **Decoupled Functions** - Azure Functions for non-instruction operations (port 7071)
3. **API Functions** - Legacy Azure Functions (port 7072)

## Service Details

### Express Server (Port 8080) - MAIN SERVICE
- **Location**: `./server/`
- **Key Routes**: 
  - `/api/instructions` - **Unified instruction endpoint** (NEW)
  - `/api/getMatters`, `/api/enquiries` - Legacy endpoints
- **Authentication**: VNet function codes, Azure Key Vault integration
- **Purpose**: Single point of entry for frontend, handles VNet function authentication

### React Dev Server (Port 3000)
- **Location**: `./src/`
- **Data Loading**: Environment-driven (`REACT_APP_USE_LOCAL_DATA`)
- **Proxy Configuration**: Routes API calls to Express server (port 8080)
- **Unified Endpoint**: Calls `/api/instructions?includeAll=true` for all instruction data

### Supporting Services (Legacy)

#### Azurite (Storage Emulator)
- **Purpose**: Local Azure storage services (blob, queue, table)
- **Ports**: 10000 (blob), 10001 (queue), 10002 (table)
- **Required for**: Azure Functions host lock and storage operations

#### Decoupled Functions (Port 7071)
- **Location**: `./decoupled-functions/`
- **Functions**: `fetchEnquiriesData`, `fetchMattersData`, etc.
- **Purpose**: Non-instruction data operations
- **Note**: Instruction data now goes through unified endpoint

#### API Functions (Port 7072)  
- **Location**: `./api/`
- **Functions**: Legacy TypeScript-based functions
- **Purpose**: Backward compatibility for existing integrations

## Startup Instructions

### Automated Setup (Recommended)
```bash
# Start all services including unified architecture
npm run dev:all
```

This starts:
- Azurite storage emulator  
- Decoupled Functions (port 7071)
- API Functions (port 7072) 
- Express Server with unified endpoints (port 8080)
- React Dev Server (port 3000)

### Manual Setup (for debugging)
```bash
# 1. Start Azurite
npx azurite

# 2. Start Decoupled Functions  
cd decoupled-functions && func start --port 7071

# 3. Start API Functions
cd api && func start --port 7072

# 4. Start Express Server  
node server/index.js

# 5. Start React Dev Server
npm start
```

### Individual Services
```bash
npm run dev:azurite      # Storage emulator only
npm run dev:functions    # Decoupled functions only  
npm run dev:api         # API functions only
npm run dev:server      # Express server only
```

## Troubleshooting

### Environment Variable Issues
**Problem**: Luke Test instruction not appearing, showing local test data
**Solution**: 
```bash
# Check environment variable precedence
echo $REACT_APP_USE_LOCAL_DATA  # Should be 'false' for production data

# Restart all Node processes to pick up environment changes
taskkill /F /IM node.exe  # Windows
pkill node                # macOS/Linux
npm run dev:all
```

### VNet Function Authentication Errors
**Problem**: 401 errors from `/api/instructions` endpoint
**Solution**:
```bash
# Test VNet function directly
curl "https://instructions-vnet-functions.azurewebsites.net/api/fetchInstructionData?code=YOUR_FUNCTION_CODE"

# If 401 error, function code has expired - get new code from Azure portal
# Update INSTRUCTIONS_FUNC_CODE in .env
```

### Database Connection Issues  
**Problem**: VNet functions can't reach database
**Cause**: Only resources in Azure Virtual Network can access production database
**Solution**: Use VNet-enabled functions, not local decoupled functions

### Port Conflicts
```bash
# Kill processes using required ports
npx kill-port 3000 7071 7072 8080 10000 10001 10002

# Or on Windows:
netstat -ano | findstr :8080
taskkill /PID <PID> /F
```

## Development Workflow

### Making Changes
1. **Frontend Changes**: Hot reload automatically updates browser
2. **Express Server Changes**: Restart manually - no hot reload
3. **Function Changes**: Azure Functions host reloads automatically
4. **Environment Changes**: Restart all Node processes

### Testing Luke Test Instruction
Luke Test instruction (HLX-27367-94842) serves as a key indicator:
- ✅ **Visible**: Production data access working correctly
- ❌ **Missing**: Using local test data or authentication failing

### Debugging Data Flow
Check browser console for unified endpoint debugging:
```
🔵 Fetching instruction data from unified server endpoint
🌐 Calling unified endpoint: /api/instructions?includeAll=true  
✅ Received clean instruction data: {count: 201, computedServerSide: true}
🔍 Debug: Luke Test found in instructions: true
```

## Production Differences

- **Database Access**: Production uses actual Azure SQL Database
- **VNet Functions**: Run in Azure Functions service with VNet integration
- **Express Server**: Deployed to Azure App Service or Container Apps  
- **Authentication**: Uses managed identity instead of function codes
- **React App**: Built and served statically from Express server

## Key Files for Next Developer

### Configuration Files
- `.env` - Environment variables for local development
- `server/routes/instructions.js` - **Unified instruction endpoint**
- `src/app/App.tsx` - Frontend data loading logic
- `decoupled-functions/fetchInstructionData/index.js` - VNet database function

### Documentation
- `ARCHITECTURE_ANALYSIS.md` - **Architecture overview and implementation details**
- `docs/INSTRUCTIONS_VNET.md` - VNet integration requirements
- `README.md` - General project setup

### Critical Environment Variables
```env
REACT_APP_USE_LOCAL_DATA=false           # Forces production data
INSTRUCTIONS_FUNC_CODE=<current-code>    # VNet function authentication  
KEY_VAULT_URL=https://helix-keys.vault.azure.net/
SQL_CONNECTION_STRING=<production-db>    # For VNet functions only
```

The unified architecture eliminates the "patchy" loading behavior and ensures consistent instruction data access. Focus on the `/api/instructions` endpoint for any instruction-related development work.
