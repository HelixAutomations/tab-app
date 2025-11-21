# Enquiries Filtering & Deduplication Analysis

## System Overview

Your enquiries system handles data from **two sources during platform transition**:
1. **Legacy system** (`helix-core-data` database)
2. **New system** (instructions database)

The deduplication is designed to handle the overlap period where both systems were running simultaneously.

## Key Deduplication Logic

### 1. **Placeholder Email Filtering**
```typescript
const placeholderEmails = ['noemail@noemail.com', 'prospects@helix-law.com'];
```
- **Purpose**: Prevents false duplicates caused by shared placeholder emails
- **Why `prospects@helix-law.com`**: This email gets reused for different people, making IDs unreliable
- **Location**: `src/index.tsx` and `ManagementDashboard.tsx`

### 2. **Cross-System Deduplication** (Server-side: `enquiries-unified.js`)

#### **Primary Match Strategy**:
```javascript
// 1. ACID (ActiveCampaign ID) matching - strongest signal
if (inst.acid) {
  const match = mainEnquiries.find(mainEnq => String(mainEnq.id) === String(inst.acid));
  // Cross-reference if found
}

// 2. FALLBACK: Email/Phone + Same Day matching
const sameEmail = (mainEnq.email && inst.email && 
  String(mainEnq.email).toLowerCase() === String(inst.email).toLowerCase());
const samePhone = (mainEnq.phone && inst.phone && 
  String(mainEnq.phone) === String(inst.phone));
const sameDay = mainDay && instDay && mainDay === instDay;
```

#### **Deduplication Priority**:
1. **Legacy records first** (helix-core-data)
2. **Instructions records** only if they don't match any legacy record

### 3. **Client-side Deduplication** (`Enquiries.tsx`)

#### **Fuzzy Key Generation**:
```typescript
const fuzzyKey = (e: any): string => {
  const day = dayKey(d);
  const email = normEmail(e.Email || e.email);
  const phone = normPhone(e.Phone_Number || e.phone);
  const contact = email || phone || name || 'unknown';
  
  // Strong signal: if email or phone present, group per day
  if (email || phone) return showMineOnly ? `${contact}|${poc}|${day}` : `${contact}|${day}`;
  
  // Weak signal (name only): include AoW per day to avoid false merges
  return `${contact}|${aow}|${day}`;
};
```

#### **Status-based Priority**:
```typescript
const statusRank = (pocRaw: string): number => {
  if (unclaimed) return 0; // Unclaimed
  if (isTriagedPoc(v)) return 1; // Triaged  
  return 2; // Claimed (highest priority)
};
```

#### **Identity Matching**:
```typescript
const sameIdentity = (a: any, b: any): boolean => {
  const aEmail = normEmail(a.Email || a.email);
  const bEmail = normEmail(b.Email || b.email);
  if (aEmail && bEmail) return aEmail === bEmail;
  
  const aPhone = normPhone(a.Phone_Number || a.phone);
  const bPhone = normPhone(b.Phone_Number || b.phone);
  if (aPhone && bPhone) return aPhone === bPhone;
  
  return false; // No email/phone = no identity match
};
```

### 4. **Suppression Logic** (Unclaimed view)

```typescript
// If claimed record exists for same contact on same day, suppress unclaimed copies
const claimedContactDaySet = useMemo(() => {
  // Build set of claimed contact|day combinations
  const key = `${contact}|${day}`;
  set.add(key);
}, [teamWideEnquiries, unclaimedEmails]);
```

## Filter Types

### **User Filters**:
- **Area of Work**: Only affects unclaimed enquiries
- **Person**: Filters by POC initials/email
- **Search**: Full-text across name, email, company, etc.
- **Date Range**: Server and client-side filtering

### **State Filters**:
- **Claimed**: Records with specific POC (not team@helix-law.com)
- **Unclaimed**: Records with team@helix-law.com POC
- **Claimable**: Unclaimed + not suppressed by claimed version

### **View Modes**:
- **Mine Only**: User's assigned enquiries
- **All**: Team-wide view (admin)

## Data Quality Issues Found

### **Duplicate ID Problem**:
- Multiple people sharing ID "28609"
- Caused by ID generation bug during system transition
- Creates false merges in deduplication logic

### **Placeholder Email Issues**:
- `prospects@helix-law.com` correctly filtered out as placeholder
- But real enquiries might use this email legitimately
- Creates noise when different people share same placeholder

## Recommendations

### **Immediate Fixes**:
1. **ID Uniqueness**: Investigate duplicate ID generation
2. **Placeholder Detection**: Improve logic to distinguish real vs placeholder emails
3. **Cross-reference Validation**: Add more robust matching beyond email/phone

### **System Improvements**:
1. **Composite Keys**: Use email+phone+date instead of just ID
2. **Migration Status**: Better tracking of record migration state
3. **Audit Trail**: Log deduplication decisions for debugging

### **Performance Optimizations**:
1. **Server-side Dedup**: Move more deduplication logic to server
2. **Caching**: Improve caching for unified enquiries
3. **Pagination**: Add proper pagination to handle large datasets

## Files Involved

### **Core Deduplication**:
- `server/routes/enquiries-unified.js` - Cross-system deduplication
- `src/tabs/enquiries/Enquiries.tsx` - Client-side deduplication
- `src/index.tsx` - Placeholder filtering

### **Supporting Logic**:
- `src/app/functionality/enquiryEnrichment.ts` - Data enrichment
- `src/tabs/Reporting/ManagementDashboard.tsx` - Reporting deduplication
- `src/components/EnquiryDataInspector.tsx` - Data inspection tools

The system is sophisticated but complex due to managing the transition between two data sources while maintaining data integrity and preventing noise.