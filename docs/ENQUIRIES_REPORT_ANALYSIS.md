# Enquiries Report - Current State Analysis

**Date**: October 3, 2025  
**Status**: ✅ Working locally  
**File**: `src/tabs/Reporting/EnquiriesReport.tsx`

---

## 📊 Current Features

### 1. **Date Range Filters**
- ✅ Today
- ✅ This week
- ✅ This month
- ✅ Last month
- ✅ This quarter
- ✅ This year
- ✅ All (no filtering)

**Default**: "This month"

### 2. **Summary Metrics (Dashboard Cards)**
- ✅ **Total Enquiries**: Count + per working day rate
- ✅ **Claimed**: Count + percentage of total
- ✅ **Unclaimed**: Count + percentage of total

### 3. **Analytics Breakdowns**
- ✅ **Top Sources** (Top 6): Shows enquiry sources with counts
- ✅ **By Fee Earner** (Top 10): Distribution by person/status
  - Individual fee earners (by email)
  - "Triaged" (commercial/property/construction shared inboxes)
  - "Unassigned" (team inbox or no POC)

### 4. **Timeline View (Recent Enquiries)**
- ✅ **Day-by-day grouping**: Sorted newest first
- ✅ **Infinite scroll**: Loads 3 day groups at a time
- ✅ **Visual timeline**: Vertical connector with date nodes
- ✅ **Per-enquiry details**:
  - Client name
  - Point of contact (with initials pill)
  - Call taker (Internal/External)
  - Status tags: "Pitched" (blue), "Instructed" (green)
  - Claimed indicator (green dot)
- ✅ **Hover highlighting**: Highlights all enquiries for a fee earner when hovering

### 5. **Status Classification**
- ✅ **Claimed**: Individual fee earner assigned (not team/triaged)
- ✅ **Triaged**: Shared department inboxes (commercial@, property@, construction@)
- ✅ **Unclaimed**: Team inbox, unassigned, or empty POC
- ✅ **Pitched vs Instructed**: Heuristics based on multiple fields

### 6. **Empty State Handling**
- ✅ **No data loaded** (null): Red warning
- ✅ **Database empty**: Yellow info (0 records in last 24 months)
- ✅ **Filtered out**: Yellow info (data exists but not in selected range)

### 7. **Technical Features**
- ✅ **Progressive loading**: Intersection Observer for infinite scroll
- ✅ **Performance**: useMemo for expensive computations
- ✅ **Dark mode support**: Full theme switching
- ✅ **Debug logging**: Console logs for troubleshooting

---

## 🎨 UI/UX Strengths

### Visual Design
- ✅ **Modern cards**: Gradient backgrounds, subtle shadows
- ✅ **Timeline aesthetic**: Vertical connector with accent color
- ✅ **Color-coded badges**: 
  - Green: Claimed, Instructed
  - Blue: Pitched
  - Grey: Triaged
  - Red: Unclaimed
- ✅ **Responsive layout**: Grid system with flexible columns
- ✅ **Hover interactions**: Highlights related enquiries

### Information Hierarchy
- ✅ **Top-level metrics**: Quick snapshot at a glance
- ✅ **Breakdowns**: Source and fee earner distribution
- ✅ **Detailed list**: Chronological timeline with full context

### User Feedback
- ✅ **Working days calculation**: Shows realistic rate expectations
- ✅ **Count badges**: Clear totals and percentages
- ✅ **Status messages**: Helpful guidance when data missing

---

## 📝 Data Flow & Processing

### Server Side (`server/routes/reporting.js`)
```javascript
fetchEnquiries({ connectionString })
  ↓
  Query: Last 24 months of enquiries
  WHERE Touchpoint_Date BETWEEN @dateFrom AND @dateTo
  ↓
  Returns: Array of enquiry records
```

**Current Limit**: Last 24 months only

### Client Side (`EnquiriesReport.tsx`)
```javascript
enquiries (prop from ReportingHome)
  ↓
  filtered (by selected date range)
  ↓
  stats (computed metrics)
  ↓
  dayGroups (grouped by date)
  ↓
  topSources / topPocs (aggregated)
```

### Source Detection Logic
Prioritizes fields in order:
1. `source`, `Ultimate_Source`, `Source`
2. `Method_of_Contact` / `moc`
3. `Referring_Company` / `company_referrer`
4. `Contact_Referrer` / `contact_referrer`
5. "Unknown" (fallback)

### POC Classification Logic
```javascript
isClaimed(poc) {
  if (!poc || poc === 'team@helix-law.com' || poc === 'team') return false;
  if (isTriagedPoc(poc)) return false; // commercial@, property@, construction@
  return true;
}
```

### Deal vs Instruction Detection
**Heuristics** (checks multiple fields):
- Instruction indicators: `InstructionRef`, `Matter_Ref`, `MatterId`, status "instructed/closed"
- Deal indicators: `pitch`, `Pitched`, `PitchedDate`, `DealId`, `ProspectId`, status "pitched"

---

## 🔍 What's Missing / Potential Improvements

### 1. **Conversion Analytics** ⚠️
Currently shows "Pitched" and "Instructed" tags, but no conversion metrics:
- ❌ Conversion rate (enquiry → pitch)
- ❌ Conversion rate (pitch → instruction)
- ❌ Time to conversion metrics
- ❌ Conversion funnel visualization
- ❌ Fee earner conversion performance

### 2. **Search & Filtering** ⚠️
- ❌ Search by client name
- ❌ Filter by source
- ❌ Filter by fee earner
- ❌ Filter by status (claimed/unclaimed/triaged)
- ❌ Filter by deal/instruction status
- ❌ Multi-select filters

### 3. **Export Functionality** ⚠️
- ❌ CSV export (function exists `toCsv()` but not wired up)
- ❌ Excel export
- ❌ PDF report generation
- ❌ Custom date range export

### 4. **Trend Analysis** ⚠️
- ❌ Line chart showing enquiries over time
- ❌ Comparison to previous period
- ❌ Source trends (which sources growing/declining)
- ❌ Seasonal patterns
- ❌ Day-of-week distribution

### 5. **Response Time Metrics** ⚠️
- ❌ Time from enquiry to claim
- ❌ Time from enquiry to pitch
- ❌ Time from pitch to instruction
- ❌ Average response time by fee earner
- ❌ SLA compliance tracking

### 6. **Team Performance** ⚠️
- ❌ Individual fee earner conversion rates
- ❌ Leaderboard (most enquiries claimed)
- ❌ Leaderboard (highest conversion rate)
- ❌ Average enquiries per fee earner
- ❌ Workload distribution visualization

### 7. **Source ROI** ⚠️
- ❌ Which sources convert best?
- ❌ Value per source (if fee data available)
- ❌ Cost per acquisition (if cost data available)
- ❌ Source effectiveness scoring

### 8. **Enhanced Timeline** ⚠️
- ❌ Click enquiry to see full details
- ❌ Quick actions (claim, pitch, instruct)
- ❌ Notes/comments on enquiries
- ❌ Linked matters (if instructed)
- ❌ Communication history

### 9. **Custom Date Range** ⚠️
- ❌ Date picker for custom start/end
- ❌ Compare date ranges side-by-side
- ❌ Preset "Last 7 days", "Last 30 days", "Last 90 days"

### 10. **Advanced Visualizations** ⚠️
- ❌ Bar charts for source comparison
- ❌ Pie chart for claimed/unclaimed/triaged split
- ❌ Heat map for enquiry volume by day/hour
- ❌ Sparklines for quick trends

### 11. **Bulk Actions** ⚠️
- ❌ Select multiple enquiries
- ❌ Bulk assign to fee earner
- ❌ Bulk categorize
- ❌ Bulk export

### 12. **Smart Insights** ⚠️
- ❌ "X% increase from last month"
- ❌ "Most active source this week"
- ❌ "Unclaimed enquiries need attention"
- ❌ "Top performer this quarter"

---

## 🎯 Priority Improvements (Suggested)

### **High Priority** 🔴
1. **Conversion Metrics** - Add conversion rate calculations and display
2. **Export to CSV** - Wire up existing `toCsv()` function
3. **Search Functionality** - Allow quick search by client name
4. **Custom Date Range** - Date picker for flexible queries

### **Medium Priority** 🟡
5. **Source Filtering** - Click source to filter timeline
6. **Fee Earner Filtering** - Click fee earner to filter timeline
7. **Trend Charts** - Simple line chart showing volume over time
8. **Response Time Tracking** - Calculate and display average response times

### **Low Priority** 🟢
9. **Advanced Visualizations** - Heat maps, sparklines
10. **Bulk Actions** - Multi-select and batch operations
11. **Smart Insights** - AI-powered suggestions and alerts
12. **Team Leaderboards** - Gamification and performance rankings

---

## 🏗️ Technical Debt

### 1. **Data Refresh**
- Currently refreshes all datasets when opening report
- Could cache enquiry data separately
- Could implement incremental updates

### 2. **Date Parsing**
- Multiple date field formats in database
- `parseDate()` helper is basic string → Date conversion
- Could fail on malformed dates

### 3. **Heuristics Brittleness**
- Deal/Instruction detection uses multiple field checks
- No single source of truth
- Could miss edge cases

### 4. **Performance**
- Large datasets could slow down filtering
- Consider virtualization for very long lists
- Memoization is good but could be optimized further

### 5. **Type Safety**
- Heavy use of `(e as any)` for field access
- Could define proper TypeScript interfaces
- Would catch errors at compile time

---

## 🚀 Next Steps

**To discuss with user:**
1. Which improvements are most valuable?
2. What specific pain points exist currently?
3. What reports do stakeholders want to see?
4. Are there any compliance/audit requirements?

**Quick wins:**
- Wire up CSV export button
- Add basic search
- Show conversion rates in summary cards
- Add "Last 7 days" / "Last 30 days" quick filters

---

## 📊 Sample Data Structure

**Enquiry Record** (inferred from code):
```typescript
{
  Touchpoint_Date: string | Date,
  Client_Name?: string,
  Description?: string,
  Client?: string,
  First_Name?: string,
  Last_Name?: string,
  Point_of_Contact?: string,
  Call_Taker?: string,
  source?: string,
  Ultimate_Source?: string,
  Source?: string,
  Method_of_Contact?: string,
  moc?: string,
  Referring_Company?: string,
  company_referrer?: string,
  Contact_Referrer?: string,
  contact_referrer?: string,
  stage?: string,
  Stage?: string,
  Status?: string,
  status?: string,
  InstructionRef?: string,
  instruction_ref?: string,
  RRef?: string,
  rref?: string,
  Matter_Ref?: string,
  MatterId?: string,
  DealId?: string | number,
  deal_id?: string | number,
  ProspectId?: string | number,
  prospect_id?: string | number,
  pitch?: boolean,
  Pitched?: boolean,
  PitchedDate?: string | Date,
  // ... many more fields likely exist
}
```

---

## 🎨 Style Tokens

**Color Palette**:
- **Accent**: `colours.highlight` (#3690CE)
- **Green**: `colours.green` (#20B26C) - Claimed, Instructed
- **Blue**: (#3B82F6) - Pitched, Deals
- **Red**: (#DC2626) - Unclaimed
- **Grey**: (#6B7280) - Triaged
- **Dark Background**: `colours.dark.background`
- **Light Background**: `colours.light.background`

**Typography**:
- Header: 18px, weight 700
- Metric cards: 28px, weight 800
- Body: 12-14px
- Labels: 11-12px, weight 600

**Spacing**:
- Container padding: 18px 22px
- Card gaps: 12px
- Surface padding: 16px
- Border radius: 12px (cards), 999px (pills)

---

**Ready for next steps! 🚀**
