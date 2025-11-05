# Server Architecture - Route Registration Guide

## 🚨 CRITICAL: Which Server File to Use

**MAIN SERVER FILE**: `server/index.js` ✅  
**LEGACY FILE**: `server/server.js` ❌ (IGNORE FOR ROUTES)

## Adding New Routes - Step by Step

### 1. Create Your Route File
```javascript
// server/routes/yourRoute.js
const express = require('express');
const router = express.Router();

router.post('/yourEndpoint', async (req, res) => {
  // Your route logic
});

module.exports = router;
```

### 2. Register in server/index.js (MAIN SERVER)
```javascript
// Add to imports section (around line 50-60)
const yourRouteRouter = require('./routes/yourRoute');

// Add to route registration section (around line 140-160)
app.use('/api', yourRouteRouter);
```

### 3. Restart Server
The server must be restarted to pick up new route registrations.

## Common Mistakes ❌

1. **Adding routes to server/server.js** - This file is ignored!
2. **Forgetting to restart server** - New routes won't be available
3. **Wrong import path** - Use `./routes/yourRoute` not `../routes/yourRoute`

## File Purpose Clarification

- **server/index.js**: The actual running server (MAIN FILE)
- **server/server.js**: Legacy/backup file (DO NOT USE FOR ROUTES)
- **server.js** (root): Simple wrapper that loads server/index.js

## Testing New Routes

```bash
# Test endpoint exists
curl -X POST http://localhost:8080/api/yourEndpoint

# If you get "Cannot POST /api/yourEndpoint" - route not registered properly
# Check server/index.js for missing import or app.use() statement
```

## Recent Example: searchInbox Route

✅ **Correct Registration** (in server/index.js):
```javascript
const searchInboxRouter = require('./routes/searchInbox');
app.use('/api', searchInboxRouter);
```

❌ **Wrong Registration** (in server/server.js - ignored):
```javascript
// This would be ignored because server/server.js is not the main server
```

---

**Remember**: Always use `server/index.js` for new routes!