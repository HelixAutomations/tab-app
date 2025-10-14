# Enquiries Report - No Data Issue

## Problem
User reports that the Enquiries Report is not showing any data, while the Management Dashboard works fine.

## Investigation

### Data Flow
1. **ReportingHome.tsx** → Fetches data from `/api/reporting/management-datasets?datasets=enquiries,...`
2. **server/routes/reporting.js** → `fetchEnquiries()` function queries database
3. **EnquiriesReport.tsx** → Receives `enquiries` prop and filters by date range

### Current Behavior
- `fetchEnquiries()` limits data to **last 24 months** via `getLast24MonthsRange()`
- Default view in EnquiriesReport is **"This month"**
- Data might be filtered out twice:
  1. Server-side: Last 24 months only
  2. Client-side: Selected date range (default: this month)

### Possible Causes

1. **No data in last 24 months**
   - Server query returns empty array
   - Would affect both Management Dashboard and Enquiries Report

2. **Date field mismatch**
   - Server query uses `Touchpoint_Date` field
   - Client filtering uses `parseDate((e as any).Touchpoint_Date)`
   - Date might be null, undefined, or in wrong format

3. **Client-side filtering too aggressive**
   - Default "This month" filter might exclude all data
   - If enquiries are older, they won't show even if fetched

4. **Data not being passed correctly**
   - `datasetData.enquiries` might be null/undefined
   - Component receives but doesn't render properly

## Debug Steps Added

### 1. Server Logging (`reporting.js`)
```javascript
console.log(`[Reporting] Fetching enquiries from ${formatDateOnly(from)} to ${formatDateOnly(to)}`);
console.log(`[Reporting] Retrieved ${enquiries.length} enquiries`);
```

**Check logs for:**
- Date range being queried
- Number of enquiries returned from database

### 2. Client Logging (`EnquiriesReport.tsx`)
```typescript
console.log('[EnquiriesReport] Received enquiries:', {
  isNull: enquiries === null,
  isArray: Array.isArray(enquiries),
  length: Array.isArray(enquiries) ? enquiries.length : 0,
  sample: Array.isArray(enquiries) && enquiries.length > 0 ? enquiries[0] : null
});
```

**Check browser console for:**
- Whether data is null/undefined
- Array length
- Sample enquiry structure (especially `Touchpoint_Date` field)

## Next Steps

### If Server Returns 0 Enquiries:
1. Check database directly:
   ```sql
   SELECT COUNT(*), MIN(Touchpoint_Date), MAX(Touchpoint_Date)
   FROM [dbo].[enquiries]
   WHERE Touchpoint_Date >= DATEADD(month, -24, GETDATE())
   ```
2. Verify data exists in the last 24 months
3. Consider extending the date range if data is older

### If Client Receives Empty Array:
1. Check network tab for API response
2. Verify `datasetData.enquiries` in ReportingHome
3. Check if data is being cached incorrectly

### If Client Receives Data But Doesn't Show:
1. Check `Touchpoint_Date` format in sample enquiry
2. Verify `parseDate()` function works with your date format
3. Try changing default range to "All" to bypass filtering
4. Check if `isWithin()` function is working correctly

### If Dates Are the Issue:
- Dates might be stored as strings, not Date objects
- `Touchpoint_Date` might be null for many records
- Date format might not parse correctly (e.g., "2024-10-03" vs "10/03/2024")

## Recommended Fix Options

### Option 1: Extend Server Query Range
Change `getLast24MonthsRange()` to fetch more data (e.g., last 36 months or all data)

### Option 2: Change Default Filter
Update `EnquiriesReport.tsx` default from "This month" to "All":
```typescript
const [rangeKey, setRangeKey] = useState<string>('all'); // Changed from 'thisMonth'
```

### Option 3: Add Loading State
Show clear feedback when:
- Data is loading
- No data in selected range
- No data in database

### Option 4: Add Date Range Info
Show user what date range is available:
```typescript
const dateRange = useMemo(() => {
  if (!enquiries || enquiries.length === 0) return null;
  const dates = enquiries
    .map(e => parseDate((e as any).Touchpoint_Date))
    .filter(Boolean)
    .sort((a, b) => a!.getTime() - b!.getTime());
  return { earliest: dates[0], latest: dates[dates.length - 1] };
}, [enquiries]);
```

## Testing Checklist

- [ ] Check server logs for date range and count
- [ ] Check browser console for received data
- [ ] Try "All" date range filter
- [ ] Check Management Dashboard has same data
- [ ] Verify sample enquiry has valid `Touchpoint_Date`
- [ ] Check network response has enquiries array
- [ ] Try querying database directly

---

**Status**: 🔍 Debug logs added, awaiting test results
