# Teams Mobile ECONNRESET Fix - Deployment Checklist

## Pre-Deployment

- [ ] Review changes in `server/utils/db.js`
- [ ] Read `docs/TEAMS_MOBILE_FIX_SUMMARY.md`
- [ ] Backup current production database
- [ ] Note current error rate for comparison
- [ ] Inform team of deployment

## Deployment

### Option A: Automated (Recommended)
- [ ] Run `.\deploy-connection-fix.ps1`
- [ ] Verify script completes without errors
- [ ] Check app service restarted successfully

### Option B: Manual
- [ ] Build application: `npm run build`
- [ ] Deploy: `.\build-and-deploy.ps1`
- [ ] Configure environment variables (see below)
- [ ] Restart app service

## Environment Variables Configuration

In Azure Portal → App Service → Configuration → Application settings:

- [ ] `SQL_MAX_CONCURRENT_REQUESTS` = `25`
- [ ] `SQL_POOL_MAX` = `25`
- [ ] `SQL_POOL_MIN` = `2`
- [ ] `SQL_REQUEST_TIMEOUT_MS` = `60000`
- [ ] `SQL_CONNECTION_TIMEOUT_MS` = `15000`
- [ ] `SQL_POOL_ACQUIRE_TIMEOUT_MS` = `10000`
- [ ] `SQL_POOL_IDLE_TIMEOUT_MS` = `30000`
- [ ] `SQL_QUEUE_TIMEOUT_MS` = `30000`
- [ ] `SQL_HEALTH_CHECK_INTERVAL_MS` = `120000`
- [ ] Click **Save**
- [ ] Confirm restart

## Post-Deployment Verification

### Immediate (5 minutes)
- [ ] App service is running
- [ ] No startup errors in logs
- [ ] Homepage loads in browser
- [ ] Homepage loads in Teams desktop

### Short-term (15 minutes)
- [ ] Monitor application logs for "SQL Connection Metrics"
- [ ] Verify metrics show healthy values:
  - [ ] `queuedRequests` < 5
  - [ ] `errorRate` < 1%
  - [ ] `totalQueueTimeouts` = 0
- [ ] Test in Teams mobile (iOS or Android):
  - [ ] Dashboard loads
  - [ ] Management page loads
  - [ ] No ECONNRESET errors visible
  - [ ] Load times < 3 seconds

### Medium-term (1 hour)
- [ ] Review Application Insights for errors
- [ ] Check Azure SQL Database performance:
  - [ ] DTU/CPU usage normal
  - [ ] No connection limit warnings
- [ ] Monitor user feedback channels
- [ ] Check error rate vs. pre-deployment baseline

### Long-term (24 hours)
- [ ] Review daily metrics summary
- [ ] Compare error rate: Before ___% → After ___%
- [ ] Collect user feedback from Teams mobile users
- [ ] Document any remaining issues
- [ ] Tune configuration if needed

## Success Criteria

Mark as successful when ALL of:
- [ ] No ECONNRESET errors in last hour
- [ ] Error rate < 1% (down from ~5-10%)
- [ ] Queue timeouts = 0
- [ ] Teams mobile users report no issues
- [ ] Page load times < 3 seconds
- [ ] Metrics logs show healthy values

## If Issues Occur

### Issue: ECONNRESET Still Happening
- [ ] Check environment variables are set correctly
- [ ] Increase concurrency limits:
  ```
  SQL_MAX_CONCURRENT_REQUESTS=50
  SQL_POOL_MAX=50
  ```
- [ ] Check database performance
- [ ] Review network connectivity

### Issue: Queue Timeouts Increasing
- [ ] Increase queue timeout:
  ```
  SQL_QUEUE_TIMEOUT_MS=45000
  ```
- [ ] Increase concurrency limits
- [ ] Check for slow queries in database

### Issue: High Error Rate (> 5%)
- [ ] Enable emergency high-concurrency mode:
  ```
  SQL_MAX_CONCURRENT_REQUESTS=100
  SQL_POOL_MAX=100
  SQL_QUEUE_TIMEOUT_MS=60000
  ```
- [ ] Check database CPU/DTU saturation
- [ ] Review Application Insights for patterns

### Issue: App Unresponsive
- [ ] Restart app service immediately
- [ ] Check application logs for errors
- [ ] Verify database is accessible
- [ ] Consider rollback if critical

## Rollback Procedure

If critical issues occur:

### Quick Rollback (Config Only)
1. [ ] Set emergency high-concurrency values (see above)
2. [ ] Restart app service
3. [ ] Monitor for improvement

### Full Rollback (Code + Config)
1. [ ] `git revert HEAD` (revert commits)
2. [ ] `npm run build`
3. [ ] `.\build-and-deploy.ps1`
4. [ ] Restart app service
5. [ ] Notify team of rollback

## Monitoring Commands

```bash
# View live logs
az webapp log tail --name link-hub-v1 --resource-group <your-rg>

# Check app status
az webapp show --name link-hub-v1 --resource-group <your-rg> --query state

# List environment variables
az webapp config appsettings list --name link-hub-v1 --resource-group <your-rg>

# Restart app
az webapp restart --name link-hub-v1 --resource-group <your-rg>
```

## Metrics to Track

Record these values pre/post deployment:

### Before Deployment
- Error rate: _______%
- ECONNRESET occurrences/hour: _______
- Average response time: _______ ms
- User complaints: _______

### After Deployment (24h)
- Error rate: _______%
- ECONNRESET occurrences/hour: _______
- Average response time: _______ ms
- User complaints: _______
- Queue timeouts: _______

## Communication

### Stakeholders to Notify
- [ ] Development team
- [ ] QA team
- [ ] Mobile app users (if testing needed)
- [ ] Management (if user-facing)

### Notification Templates

**Pre-Deployment:**
```
Deploying Teams mobile connection stability fix at [TIME].
Expected brief service interruption during restart.
Will monitor and provide update in 1 hour.
```

**Post-Deployment Success:**
```
Teams mobile fix deployed successfully.
- ECONNRESET errors eliminated
- Error rate reduced from X% to Y%
- Page load times improved
Please report any issues via [CHANNEL].
```

**Post-Deployment Issues:**
```
Deployment complete but monitoring for issues.
Known: [DESCRIBE ISSUE]
Mitigation: [DESCRIBE ACTION]
Will provide update in [TIMEFRAME].
```

## Documentation

After successful deployment:
- [ ] Update CHANGELOG with deployment date
- [ ] Document final production configuration values
- [ ] Add lessons learned to team wiki
- [ ] Create runbook for future similar issues
- [ ] Archive deployment logs

## Sign-Off

Deployment completed by: _________________ Date: _________

Verified by: _________________ Date: _________

Production approved by: _________________ Date: _________

## Notes / Issues Encountered

[Space for deployment notes]

---

## Quick Reference

**Healthy Metrics:**
```
queuedRequests: 0-5
errorRate: < 1%
totalQueueTimeouts: 0
```

**Problem Indicators:**
```
queuedRequests: > 10
errorRate: > 5%
totalQueueTimeouts: increasing
```

**Emergency Action:**
Set all limits to 100 and queue timeout to 60s, restart.
