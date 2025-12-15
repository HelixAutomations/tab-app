# Helix Hub Logging Architecture

> House style for consistent, recoverable, and actionable logging.

## Philosophy

1. **Logs are for recovery** - If an operation fails, logs should contain enough context to retry or debug
2. **Less is more** - Only log what's actionable; verbose logs obscure important events
3. **Structured by domain** - Use prefixed loggers for easy filtering
4. **Environment-aware** - Dev gets detail; production gets essentials

---

## Log Levels

| Level | When to Use | Prod Visibility |
|-------|-------------|-----------------|
| `error` | Operation failed, needs attention | ✅ Always |
| `warn` | Recoverable issue, degraded state | ✅ Always |
| `info` | Key operation completed | ⚠️ Sparse |
| `debug` | Development troubleshooting | ❌ Never |

---

## What to Log (Application Insights / Recovery)

### ✅ ALWAYS LOG (errors & key operations)

```javascript
// Operation failures with recovery context
logger.error('Matter open failed', {
  operation: 'matter:open',
  matterId: 123,
  enquiryId: 456,
  clientEmail: 'j***@example.com', // masked
  reason: error.message,
  recoverable: true
});

// Critical business operations
logger.info('Matter opened', {
  operation: 'matter:open',
  matterId: result.id,
  enquiryId,
  durationMs: Date.now() - start
});

// External service failures
logger.warn('Clio rate limited', {
  service: 'clio',
  endpoint: '/contacts',
  retryAfter: 30
});
```

### ❌ DON'T LOG

- Request/response bodies (use opLog for audit)
- Per-iteration progress ("Processing item 1 of 100...")  
- Cache hits (expected behavior)
- Successful health checks
- Routine CRUD without business significance

---

## Naming Convention

### Logger Prefixes (Domain Modules)

| Prefix | Domain | Usage |
|--------|--------|-------|
| `DB` | Database operations | SQL queries, connection state |
| `Cache` | Redis/memory cache | Misses, invalidation |
| `Clio` | Clio API | Sync, CRUD, rate limits |
| `Auth` | Authentication | Login, token refresh |
| `Stream` | SSE/real-time | Connection lifecycle |
| `Enquiries` | Enquiry operations | Creation, updates, claims |
| `Matters` | Matter operations | Open, close, transfers |
| `Payments` | Payment processing | Stripe, Tiller |

### Operation Names

Use `domain:action` format:
- `enquiry:create`
- `matter:open`
- `clio:contact:sync`
- `payment:capture`
- `cache:invalidate`

---

## Server Logger Usage

```javascript
const { loggers, createLogger } = require('./utils/logger');

// Use pre-configured loggers
loggers.clio.info('Contact synced', { contactId: 123 });
loggers.db.error('Query failed', { query: 'SELECT...', error: e.message });

// Or create custom for specific module
const log = createLogger('MyModule');
log.info('Something happened');
```

---

## Frontend Logger Usage

```typescript
import { createLogger, errorLog } from '../utils/debug';

const log = createLogger('EnquiryPanel');
log.debug('Panel rendered', { enquiryId }); // Dev only
log.error('Failed to load', { error: e.message }); // Always
```

---

## Application Insights Events

Key operations that **must** reach Application Insights for recovery/audit:

### Critical Operations (trackEvent)
- `matter:opened` - New matter created from enquiry
- `matter:closed` - Matter archived/closed
- `enquiry:claimed` - User claimed an enquiry
- `enquiry:converted` - Enquiry converted to instruction
- `payment:captured` - Payment successful
- `payment:failed` - Payment failed

### Error Tracking (trackException)
- Database connection failures
- External API failures (Clio, Stripe, etc.)
- Data integrity issues
- Authentication failures

### Custom Dimensions
Always include:
- `operation` - The action name
- `userId` - Who triggered (if available)
- `entityId` - Primary key of affected record
- `durationMs` - How long it took
- `correlationId` - For tracing across services

---

## OpLog vs Console Logging

| Concern | OpLog | Logger |
|---------|-------|--------|
| Purpose | Audit trail | Debugging |
| Persistence | File + memory | Console/App Insights |
| Content | HTTP requests, operations | Errors, warnings, key events |
| Retention | 1000 events rotating | Log aggregator dependent |

---

## Real-Time Log Stream

The `/api/logs/stream` endpoint provides SSE streaming of console output for development debugging.

**Important**: Console interception only activates when clients are connected to minimize overhead.

---

## Migration Checklist

When adding logging to existing code:

- [ ] Replace `console.log` with appropriate logger level
- [ ] Use domain prefix for the logger
- [ ] Include operation name in structured format
- [ ] Mask PII (emails, names, tokens)
- [ ] Add error context for recoverability
- [ ] Remove verbose iteration logs
- [ ] Keep warnings for degraded-but-working states

---

## Examples

### Good ✅

```javascript
// Operation with recovery context
loggers.enquiries.error('Claim failed', {
  operation: 'enquiry:claim',
  enquiryId,
  userId: user.id,
  reason: error.message,
  canRetry: true
});

// Key business event
loggers.matters.info('Matter opened', {
  operation: 'matter:open',
  matterId: result.id,
  fromEnquiry: enquiryId,
  assignedTo: solicitorId
});
```

### Bad ❌

```javascript
// Too verbose
console.log('Starting to process enquiry...');
console.log('Found 5 matching contacts');
console.log('Checking contact 1...');
console.log('Checking contact 2...');
// ...

// No context
console.error('Error!');

// Leaking PII
console.log('Processing user: john.smith@email.com');
```
