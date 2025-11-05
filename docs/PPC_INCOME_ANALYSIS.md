# PPC Report Income Drop - Root Cause Analysis

## Summary
The PPC report is showing **less income** than before due to backend query changes in `reporting-stream.js`. The issue is NOT in the PPC report component itself, but in **how data is fetched from the database**.

---

## Root Cause

### 1. **New TOP Limit on Collected Time Query** ⚠️
**File:** `server/routes/reporting-stream.js` (line 448)

**Before:** No TOP limit - fetched all matching records
```sql
-- Old query (implicit, fetched all rows)
SELECT matter_id, bill_id, contact_id, id, ...
FROM [dbo].[collectedTime] WITH (NOLOCK)
WHERE payment_date BETWEEN @dateFrom AND @dateTo
```

**After:** Hard limit of 50,000 records per quarter
```sql
SELECT TOP 50000 matter_id, bill_id, contact_id, id, 
       CONVERT(VARCHAR(10), payment_date, 120) AS payment_date,
       created_at, kind, type, activity_type, description, 
       sub_total, tax, secondary_tax, user_id, user_name, payment_allocated
FROM [dbo].[collectedTime] WITH (NOLOCK)
WHERE payment_date BETWEEN @dateFrom AND @dateTo
ORDER BY payment_date DESC, id DESC
```

**Impact:** If you have >50,000 collected time records in a single quarter, **the oldest ones are silently dropped** because they're ordered by DESC (newest first) and then cut off.

---

### 2. **Quarterly Windowing** 
**File:** `server/routes/reporting-stream.js` (line 430)

**Before:** Monthly windows (12 windows for 24 months)
```javascript
const windows = enumerateMonthlyWindows(from, to);
```

**After:** Quarterly windows (4 windows for 24 months)
```javascript
const windows = enumerateQuarterlyWindows(from, to);
```

**Impact:** While this reduces query count, combined with the TOP 50,000 limit per window, you're now fetching:
- **Before:** 12 monthly queries, each potentially returning all records for that month
- **After:** 4 quarterly queries, each limited to TOP 50,000 records

If a single quarter has >50,000 records, the older records in that quarter get truncated.

---

### 3. **Missing Field Sorting Issue**
**File:** `server/routes/reporting-stream.js` (line 441)

The query now includes:
```sql
ORDER BY payment_date DESC, id DESC
```

This sorts by newest payments first, then by ID descending. When you apply `TOP 50000`, you get:
- ✅ The most recent 50,000 payment records for that quarter
- ❌ Any older payments in that same quarter are lost

---

## Example Scenario

**Scenario:** Q1 2025 (Jan-Mar) has 60,000 collected time records

| Quarter | Records | Query Behavior | Result |
|---------|---------|-----------------|--------|
| **Before changes** | 60,000 | No TOP limit, fetch all | ✅ All 60,000 records |
| **After changes** | 60,000 | TOP 50,000 (newest first) | ❌ Only 50,000 newest records, **10,000 older payments LOST** |

---

## Why PPC Report Shows Less Income

1. **PPC Income Metrics Calculation** (`ReportingHome.tsx` line 1211-1450):
   - Filters `recoveredFees` dataset by PPC-linked matters
   - Sums `payment_allocated` from matched fees
   - **Problem:** If 10,000 old PPC payments are missing from `recoveredFees`, they won't be included in the sum

2. **Data Flow:**
   ```
   Database (collectedTime table)
      ↓
   reporting-stream.js fetchRecoveredFees() [NEW TOP 50000 LIMIT]
      ↓
   ReportingHome.tsx ppcIncomeMetrics calculation
      ↓
   PpcReport.tsx display
   ```

---

## Solution Options

### Option A: Remove TOP Limit (Best for accuracy)
```javascript
const result = await request.query(`
  SELECT matter_id, bill_id, contact_id, id, 
         CONVERT(VARCHAR(10), payment_date, 120) AS payment_date,
         created_at, kind, type, activity_type, description, 
         sub_total, tax, secondary_tax, user_id, user_name, payment_allocated
  FROM [dbo].[collectedTime] WITH (NOLOCK)
  WHERE payment_date BETWEEN @dateFrom AND @dateTo
  ORDER BY payment_date DESC, id DESC
`);
```
- **Pros:** Complete data, accurate reports
- **Cons:** May be slower for very large quarters (but you have 5min timeout)

### Option B: Increase TOP Limit
```javascript
SELECT TOP 100000 matter_id, bill_id, contact_id, id, ...
```
- **Pros:** Covers more records while still limiting
- **Cons:** Still incomplete if >100k records in a quarter

### Option C: Keep Quarterly Windows, Remove TOP Limit
```javascript
const windows = enumerateQuarterlyWindows(from, to);
// In query: Remove "TOP 50000" but keep ORDER BY
```
- **Pros:** Good balance - fewer queries, no data loss
- **Cons:** Queries might be slower

### Option D: Monthly Windows + Higher TOP Limit
```javascript
const windows = enumerateMonthlyWindows(from, to);
// TOP 50000 per month is more reasonable
```
- **Pros:** Backward compatible, 12 queries, TOP limits work better with monthly chunks
- **Cons:** More queries than quarterly

---

## Recommendation

**Use Option C: Keep quarterly windows but remove the TOP 50000 limit**

```javascript
// Line 448 in reporting-stream.js
const result = await request.query(`
  SELECT matter_id, bill_id, contact_id, id, 
         CONVERT(VARCHAR(10), payment_date, 120) AS payment_date,
         created_at, kind, type, activity_type, description, 
         sub_total, tax, secondary_tax, user_id, user_name, payment_allocated
  FROM [dbo].[collectedTime] WITH (NOLOCK)
  WHERE payment_date BETWEEN @dateFrom AND @dateTo
  ORDER BY payment_date DESC, id DESC
`);
```

**Why?**
- ✅ Maintains quarterly optimization (fewer queries)
- ✅ Gets all collected time data (no truncation)
- ✅ 5-minute timeout per quarter is sufficient
- ✅ Matches the performance intent without losing data

---

## Verification Steps

After implementing the fix:

1. **Browser console:** Check network tab for `/api/reporting-stream/stream-datasets`
   - Look at payload for `recoveredFees` dataset size
   - Should increase back to previous levels

2. **Server logs:** Check for messages like:
   - `📊 Recovered Fees Query: Combined XXXX records across 4 quarterly windows`
   - Should see numbers closer to previous runs

3. **PPC Report:** Navigate to PPC Report tab
   - Income totals should return to previous amounts
   - Timeline/date filters should show complete payment history

---

## Testing Query

Run this directly in SQL to verify data availability:

```sql
-- Check how many records per quarter
SELECT YEAR(payment_date) as yr, QUARTER(payment_date) as qtr, COUNT(*) as cnt
FROM [dbo].[collectedTime]
WHERE payment_date >= DATEADD(MONTH, -24, GETDATE())
GROUP BY YEAR(payment_date), QUARTER(payment_date)
ORDER BY yr DESC, qtr DESC;

-- Check specifically for Q3 2025 data
SELECT COUNT(*) FROM [dbo].[collectedTime]
WHERE payment_date BETWEEN '2025-07-01' AND '2025-09-30';
```

If any quarter shows >50,000 records, that's the problem quarter with data loss.
