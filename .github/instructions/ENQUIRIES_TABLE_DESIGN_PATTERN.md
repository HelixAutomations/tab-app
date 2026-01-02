# Enquiries Table Design Pattern

## Overview
The enquiries table is a sophisticated data grid implementation that serves as the primary interface for managing enquiry data. This pattern should be replicated for other tabular data components throughout the system.

## Core Design Principles

### 1. **Dual Schema Architecture** 
- **Legacy Schema**: CamelCase fields (`First_Name`, `Last_Name`, `Touchpoint_Date`)
- **New Schema**: snake_case fields (`first`, `last`, `datetime`)
- **Unified Interface**: Components handle both transparently using fallback patterns

```typescript
// Field normalization pattern
const firstName = enq.First_Name || enq.first_name || enq.first;
const lastName = enq.Last_Name || enq.last_name || enq.last;
const date = enq.Touchpoint_Date || enq.datetime || enq.Date_Created;
```

### 2. **Database Schema Structure**
Based on [`docs/enquiries-table-fields.md`](enquiries-table-fields.md):
- **Core Fields**: `id`, `datetime`, `stage`, `claim`, `poc`, `first`, `last`, `email`, `phone`
- **Business Logic**: `value`, `notes`, `aow`, `tow`, `moc`, `pitch`
- **Extended Data**: Additional JSON payload in `enquiry_extended_data` table
- **Audit Fields**: `source`, `acid`, `card_id`, tracking fields

### 3. **Grid Layout System**
```css
gridTemplateColumns: '70px 40px 0.6fr 1.4fr 2fr 0.5fr'
```
- **70px**: Date column (fixed width for consistency)
- **40px**: AOW indicator (compact icon/badge)
- **0.6fr**: Value column (proportional, smaller)
- **1.4fr**: Contact details (proportional, medium)
- **2fr**: Notes/details (proportional, largest)
- **0.5fr**: Actions column (proportional, smaller)

### 4. **Interactive Sorting**
All columns are clickable with visual feedback:
```typescript
const sortLogic = {
  date: 'desc',     // Newest first by default
  aow: 'asc',       // Alphabetical
  value: 'desc',    // Highest value first
  contact: 'asc',   // Alphabetical
  pipeline: 'asc'   // Alphabetical
};
```
- Hover states with colour transitions
- Active sort indicators with chevron icons
- Theme-aware highlighting (`#60a5fa` dark, `#2563eb` light)

### 5. **Timeline Visual Design**
- **Day Separators**: Automatic grouping by date with collapsible sections
- **Timeline Line**: Vertical line (`left: -20px`) connecting all entries
- **Timeline Dots**: Circular indicators (`8px diameter`) at separator points
- **Collapse/Expand**: ChevronRight/ChevronDown icons for day groups

### 6. **Responsive Theme System**
```typescript
const themeStyles = {
  background: isDarkMode 
    ? 'rgba(15, 23, 42, 0.6)' 
    : '#ffffff',
  border: isDarkMode 
    ? 'rgba(255, 255, 255, 0.1)' 
    : 'rgba(0, 0, 0, 0.08)',
  text: isDarkMode 
    ? 'rgba(255, 255, 255, 0.9)' 
    : 'rgba(0, 0, 0, 0.85)'
};
```

### 7. **Sticky Header Design**
- `position: sticky` with `top: 0`
- Backdrop filter blur: `blur(12px)`
- Semi-transparent background with `alpha 0.95`
- Typography: `10px`, `uppercase`, `letterSpacing: '0.5px'`
- Subtle box shadow for depth

### 8. **Row Interaction Patterns**
- **Zebra Striping**: `idx % 2 === 0` for alternating row colours
- **Hover States**: Subtle background lightening
- **Click Actions**: Row-level expansion for detailed views
- **Context Menus**: Right-click for bulk operations

## Implementation Architecture

### Component Structure
```
src/tabs/enquiries/
├── Enquiries.tsx           # Main container component
├── EnquiryData.tsx         # Individual row detail view
├── UnclaimedEnquiries.tsx  # Specialized unclaimed view
├── CreateContactModal.tsx  # Contact creation workflow
└── AreaCountCard.tsx       # Summary statistics
```

### Data Flow Pattern
1. **Fetch**: `fetchEnquiries()` with date range filtering
2. **Transform**: Normalize legacy/new schema differences
3. **Filter**: Client-side filtering by search terms, area, POC
4. **Sort**: Multi-column sorting with persistent preferences
5. **Group**: Optional grouping by date, area, or pipeline
6. **Render**: Virtual or paginated rendering for performance

### State Management
```typescript
interface EnquiryTableState {
  enquiries: (Enquiry & { __sourceType: 'new' | 'legacy' })[];
  viewMode: 'card' | 'table';
  sortColumn: 'date' | 'aow' | 'value' | 'contact' | 'pipeline';
  sortDirection: 'asc' | 'desc';
  collapsedDays: Set<string>;
  searchTerm: string;
  selectedArea: string;
  enrichmentMap: Map<string, EnquiryEnrichmentData>;
}
```

### Performance Optimizations
- **Debounced Search**: 300ms delay on search input
- **Memoized Filters**: `useMemo` for expensive calculations
- **Virtual Scrolling**: For large datasets (100+ items)
- **Lazy Loading**: Pagination for historical data
- **Index Caching**: Client-side caching of filtered results

## Replication Guidelines

### For New Table Components
1. **Copy grid system**: Use the same `gridTemplateColumns` pattern
2. **Implement sorting**: Use the interactive header pattern
3. **Add timeline visuals**: Include day separators and dots
4. **Theme consistency**: Apply the same colour/spacing system
5. **Responsive design**: Ensure mobile adaptability
6. **Performance patterns**: Include debouncing and memoization

### Database Integration
```sql
-- Standard table pattern
CREATE TABLE [new_table] (
    id INT IDENTITY(1,1) PRIMARY KEY,
    datetime DATETIME2(7) NOT NULL DEFAULT SYSUTCDATETIME(),
    stage VARCHAR(50) NULL,
    -- Add domain-specific fields
    source VARCHAR(100) NOT NULL,
    updated_at DATETIME2(7) NOT NULL DEFAULT SYSUTCDATETIME()
);

-- Extended data pattern
CREATE TABLE [new_table_extended_data] (
    table_id INT NOT NULL PRIMARY KEY,
    payload NVARCHAR(MAX) NULL,
    updated_at DATETIME2(7) NOT NULL DEFAULT SYSUTCDATETIME(),
    FOREIGN KEY (table_id) REFERENCES [new_table](id)
);
```

### API Endpoint Pattern
```typescript
// Follow getEnquiries.ts pattern
interface TableRequest {
  email: string;      // User filtering
  dateFrom: string;   // Range filtering
  dateTo: string;     // Range filtering
  fetchAll?: boolean; // Admin override
}

interface TableResponse {
  data: TableRecord[];
  totalCount: number;
  hasMore: boolean;
}
```

## Files to Reference
- **Main Implementation**: `src/tabs/enquiries/Enquiries.tsx`
- **Data Types**: `src/app/functionality/types.ts`
- **API Layer**: `api/src/functions/getEnquiries.ts`
- **Schema Reference**: `docs/enquiries-table-fields.md`
- **Backend Service**: `submodules/enquiry-processing-v2/Services/EnquiryService.cs`

## Quality Standards
- ✅ **Accessibility**: Keyboard navigation, ARIA labels
- ✅ **Performance**: Sub-200ms render times, smooth scrolling
- ✅ **Responsive**: Mobile-first design, touch-friendly
- ✅ **Theme Support**: Dark/light mode compatibility
- ✅ **Error Handling**: Graceful degradation, user feedback
- ✅ **Backwards Compatibility**: Legacy and new data formats

This pattern ensures consistency across all tabular data components while maintaining the sophisticated UX that makes the enquiries table highly effective for complex data management tasks.