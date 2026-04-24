# CCL Pipeline — KQL Saved Searches

All CCL pipeline events are emitted via `trackClientEvent('operations-ccl', name, props)` from the client and `trackEvent(name, props)` from `server/routes/ccl.js`. The standard filter is:

```kql
customEvents
| where customDimensions.source == 'operations-ccl'
   or name startswith 'CCL.'
```

Keep these four queries saved in Azure Portal → Application Insights → Logs.

## 1. Pipeline funnel (last 7 days)

Count of each pipeline phase per day. Drop-offs between rows indicate missing steps.

```kql
customEvents
| where timestamp > ago(7d)
| where name in (
    'CCL.AutoFill.Started',
    'CCL.AutoFill.Completed',
    'CCL.AutoFill.Failed',
    'CCL.PressureTest.Started',
    'CCL.PressureTest.Completed',
    'CCL.PressureTest.Failed',
    'CCL.Approve.Completed',
    'CCL.NdUpload.Completed'
  )
| summarize Count = count() by bin(timestamp, 1d), name
| order by timestamp desc, name asc
```

## 2. Matter-level pipeline trace

Full event history for a single matter. Replace `MATTER_ID` with the matter id.

```kql
customEvents
| where timestamp > ago(30d)
| where name startswith 'CCL.'
| extend matterId = tostring(customDimensions.matterId)
| where matterId == 'MATTER_ID'
| project timestamp, name, customDimensions
| order by timestamp asc
```

## 3. Failure hotspots (last 14 days)

Which phase fails most, with error messages.

```kql
customEvents
| where timestamp > ago(14d)
| where name endswith '.Failed' and name startswith 'CCL.'
| extend error = tostring(customDimensions.error)
| summarize Count = count(), Samples = make_list(error, 5) by name
| order by Count desc
```

## 4. Pipeline latency (AutoFill → PressureTest → Approve)

Time between phases per matter.

```kql
let filled = customEvents
  | where timestamp > ago(14d)
  | where name == 'CCL.AutoFill.Completed'
  | extend matterId = tostring(customDimensions.matterId)
  | project matterId, filledAt = timestamp;
let tested = customEvents
  | where timestamp > ago(14d)
  | where name == 'CCL.PressureTest.Completed'
  | extend matterId = tostring(customDimensions.matterId)
  | project matterId, testedAt = timestamp;
let approved = customEvents
  | where timestamp > ago(14d)
  | where name == 'CCL.Approve.Completed'
  | extend matterId = tostring(customDimensions.matterId)
  | project matterId, approvedAt = timestamp;
filled
| join kind=leftouter tested on matterId
| join kind=leftouter approved on matterId
| extend fillToTestMin = datetime_diff('minute', testedAt, filledAt)
| extend testToApproveMin = datetime_diff('minute', approvedAt, testedAt)
| project matterId, filledAt, testedAt, approvedAt, fillToTestMin, testToApproveMin
| order by filledAt desc
```
