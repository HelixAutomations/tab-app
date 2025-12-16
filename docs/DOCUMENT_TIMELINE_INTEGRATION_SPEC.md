# Document Timeline Integration Spec

**Date**: December 15, 2025  
**Target Repository**: `helix hub v1` (Tab App)  
**Related Spec**: [PROSPECT_DOCUMENT_MANAGEMENT_SPEC.md](./PROSPECT_DOCUMENT_MANAGEMENT_SPEC.md)  
**Purpose**: Integrate documents as first-class timeline events in EnquiryTimeline

---

## Requirements Summary

### 1. EnquiryLineItem Document Badge
Show a document count badge on each enquiry card to indicate if documents exist.

**Visual**: Small pill/badge next to existing action buttons
```
📄 3    (if 3 documents exist)
```
No badge shown if count = 0.

### 2. EnquiryTimeline Document Events
Documents appear as timeline events alongside pitches, emails, and calls:
- Same visual treatment as other event types
- Shows upload timestamp, uploader, document type
- Expandable to show document details and preview/download link

---

## Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DOCUMENT DATA FLOW                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. EnquiryLineItem (List View)                                            │
│     └── Fetch: GET /api/prospect-documents/count?enquiry_id={id}           │
│         └── Response: { count: 3 }                                         │
│         └── Render: Badge if count > 0                                     │
│                                                                             │
│  2. EnquiryTimeline (Detail View)                                          │
│     └── Fetch: GET /api/prospect-documents?enquiry_id={id}                 │
│         └── Response: [{ id, filename, uploadedAt, uploadedBy, type, ... }]│
│         └── Transform to TimelineItem[]                                    │
│         └── Merge with pitches, emails, calls                              │
│         └── Sort by date                                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### API Endpoints (from instruct-pitch)

These endpoints already exist or are specified in PROSPECT_DOCUMENT_MANAGEMENT_SPEC.md:

```typescript
// Get document count for enquiry (lightweight for list view)
GET /api/prospect-documents/count?enquiry_id={id}
Response: { count: number }

// Get all documents for enquiry (full details for timeline)
GET /api/prospect-documents?enquiry_id={id}
Response: Array<{
  id: number;
  enquiry_id: number;
  instruction_ref: string | null;
  blob_url: string;
  original_filename: string;
  file_size: number;
  content_type: string;
  document_type: string;
  uploaded_by: string;
  uploaded_at: string;  // ISO date
  stage_uploaded: 'enquiry' | 'pitch' | 'instruction';
  notes: string | null;
}>
```

---

## Implementation Details

### File 1: EnquiryTimeline.tsx

#### 1.1 Add 'document' to CommunicationType

```typescript
// Line ~21: Update type union
type CommunicationType = 'pitch' | 'email' | 'call' | 'instruction' | 'note' | 'document';
```

#### 1.2 Add document metadata to TimelineItem interface

```typescript
// Line ~23: Extend metadata interface
interface TimelineItem {
  id: string;
  type: CommunicationType;
  date: string;
  subject: string;
  content?: string;
  contentHtml?: string;
  createdBy: string;
  metadata?: {
    duration?: number;
    direction?: 'inbound' | 'outbound';
    amount?: number;
    status?: string;
    scenarioId?: string;
    answered?: boolean;
    source?: string;
    recordingUrl?: string | null;
    messageId?: string;
    feeEarnerEmail?: string;
    internetMessageId?: string;
    // NEW: Document-specific fields
    documentType?: string;        // 'engagement_letter', 'id_document', etc.
    filename?: string;            // Original filename
    fileSize?: number;            // In bytes
    contentType?: string;         // MIME type
    blobUrl?: string;             // Azure blob URL for download
    stageUploaded?: 'enquiry' | 'pitch' | 'instruction';
  };
}
```

#### 1.3 Add document loading state

```typescript
// Line ~67: Add to loadingStates
const [loadingStates, setLoadingStates] = useState({
  pitches: true,
  emails: true,
  calls: true,
  documents: true,  // NEW
});
```

#### 1.4 Fetch documents in useEffect

```typescript
// Inside fetchTimeline async function, after existing fetches:

// Fetch documents
try {
  const docsRes = await fetch(`/api/prospect-documents?enquiry_id=${enquiry.ID}`);
  if (docsRes.ok) {
    const docsData = await docsRes.json();
    const documents = Array.isArray(docsData) ? docsData : [];
    
    const docItems: TimelineItem[] = documents.map((doc: any, index: number) => ({
      id: `document-${doc.id || index}`,
      type: 'document' as CommunicationType,
      date: doc.uploaded_at,
      subject: doc.original_filename || 'Document',
      content: doc.notes || undefined,
      createdBy: doc.uploaded_by || 'Unknown',
      metadata: {
        documentType: doc.document_type,
        filename: doc.original_filename,
        fileSize: doc.file_size,
        contentType: doc.content_type,
        blobUrl: doc.blob_url,
        stageUploaded: doc.stage_uploaded,
      }
    }));
    
    timelineItems.push(...docItems);
  }
  setLoadingStates(prev => ({ ...prev, documents: false }));
} catch (error) {
  console.error('Failed to fetch documents:', error);
  setLoadingStates(prev => ({ ...prev, documents: false }));
}
```

#### 1.5 Add document to getTypeIcon function

```typescript
// Line ~792: Add case
const getTypeIcon = (type: CommunicationType) => {
  switch (type) {
    case 'pitch':
      return <FaEnvelope />;
    case 'email':
      return <FaEnvelope />;
    case 'call':
      return <FaPhone />;
    case 'instruction':
      return <FaFileAlt />;
    case 'note':
      return <FaCircle />;
    case 'document':            // NEW
      return <FaFileAlt />;     // Or use a different icon like FaFile, FaFolder
    default:
      return <FaCircle />;
  }
};
```

#### 1.6 Add document to getTypeColor function

```typescript
// Line ~809: Add case
const getTypeColor = (type: CommunicationType) => {
  switch (type) {
    case 'call':
      return '#f59e0b'; // Amber/Orange
    case 'pitch':
      return '#22c55e'; // Green
    case 'email':
      return colours.highlight; // Blue
    case 'instruction':
      return '#10b981'; // Emerald
    case 'note':
      return '#6B7280';
    case 'document':          // NEW
      return colours.accent;  // Helix accent teal (#87F3F3) - on brand
    default:
      return '#6B7280';
  }
};
```

#### 1.7 Add document to getTypeLabel function

```typescript
// Line ~827: Add case
const getTypeLabel = (type: CommunicationType) => {
  switch (type) {
    case 'pitch':
      return 'Pitch Sent';
    case 'email':
      return 'Email';
    case 'call':
      return 'Call';
    case 'instruction':
      return 'Instruction';
    case 'note':
      return 'Note';
    case 'document':          // NEW
      return 'Document';
    default:
      return 'Activity';
  }
};
```

#### 1.8 Add Documents filter button (optional)

```typescript
// In the filter buttons section (~line 1570), add:
<button
  onClick={() => setActiveFilter(activeFilter === 'document' ? null : 'document')}
  style={{
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '11px',
    fontWeight: 500,
    background: activeFilter === 'document' 
      ? colours.accent 
      : isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.08)',
    color: activeFilter === 'document'
      ? colours.darkBlue
      : isDarkMode ? 'rgba(226, 232, 240, 0.7)' : 'rgba(15, 23, 42, 0.7)',
    border: 'none',
    cursor: 'pointer',
  }}
>
  📄 Docs {!loadingStates.documents && `(${timeline.filter(item => item.type === 'document').length})`}
</button>
```

#### 1.9 Render document-specific content when expanded

```typescript
// In the expanded item content section, add handling for documents:
{item.type === 'document' && item.metadata && (
  <div style={{ marginTop: '8px' }}>
    <div style={{
      display: 'flex',
      gap: '16px',
      fontSize: '11px',
      color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(15, 23, 42, 0.6)',
      marginBottom: '8px',
    }}>
      {item.metadata.documentType && (
        <span style={{
          padding: '2px 8px',
          borderRadius: '4px',
          background: isDarkMode ? 'rgba(135, 243, 243, 0.15)' : 'rgba(135, 243, 243, 0.2)',
          color: isDarkMode ? colours.accent : colours.darkBlue,
          fontWeight: 500,
        }}>
          {item.metadata.documentType.replace(/_/g, ' ')}
        </span>
      )}
      {item.metadata.fileSize && (
        <span>{formatFileSize(item.metadata.fileSize)}</span>
      )}
      {item.metadata.stageUploaded && (
        <span>Uploaded at: {item.metadata.stageUploaded}</span>
      )}
    </div>
    <div style={{ display: 'flex', gap: '8px' }}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setPreviewDocument(item);
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          borderRadius: '4px',
          fontSize: '11px',
          fontWeight: 500,
          background: colours.highlight,
          color: '#ffffff',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        <FaFileAlt /> Preview
      </button>
    </div>
  </div>
)}
```

#### 1.10 Helper function for file size

```typescript
// Add helper function
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};
```

---

### File 2: EnquiryLineItem.tsx

#### 2.1 Add documentCount prop

```typescript
// Line ~140: Add to interface
interface EnquiryLineItemProps {
  enquiry: Enquiry & { __sourceType?: 'new' | 'legacy' };
  onSelect: (enquiry: Enquiry) => void;
  onRate: (enquiryId: string) => void;
  onRatingChange?: (enquiryId: string, newRating: string) => Promise<void>;
  onPitch?: (enquiry: Enquiry) => void;
  teamData?: TeamData[] | null;
  isLast?: boolean;
  userAOW?: string[];
  onFilterByPerson?: (initials: string) => void;
  isNewSource?: boolean;
  promotionStatus?: 'pitch' | 'instruction' | null;
  teamsActivityData?: TeamsActivityData | null;
  documentCount?: number;  // NEW: Number of documents for this enquiry
}
```

#### 2.2 Destructure in component

```typescript
// Line ~206: Add to destructuring
const EnquiryLineItem: React.FC<EnquiryLineItemProps> = ({
  enquiry,
  onSelect,
  onRate,
  onRatingChange,
  onPitch,
  teamData,
  isLast,
  userAOW,
  onFilterByPerson,
  isNewSource = false,
  promotionStatus = null,
  teamsActivityData = null,
  documentCount = 0,  // NEW
}) => {
```

#### 2.3 Add document badge after TeamsLinkWidget

```typescript
// Line ~1086 (after TeamsLinkWidget): Add document badge
{documentCount > 0 && (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: '4px 10px',
      borderRadius: '6px',
      fontSize: '11px',
      fontWeight: 600,
      background: isDarkMode ? 'rgba(135, 243, 243, 0.15)' : 'rgba(135, 243, 243, 0.2)',
      color: isDarkMode ? colours.accent : colours.darkBlue,
    }}
    title={`${documentCount} document${documentCount > 1 ? 's' : ''} attached`}
  >
    <Icon iconName="Documentation" style={{ fontSize: '12px' }} />
    {documentCount}
  </div>
)}
```

---

### File 3: Enquiries.tsx (Parent Component)

#### 3.1 Fetch document counts for all enquiries

Option A: **Batch fetch** (recommended for performance)
```typescript
// After loading enquiries, fetch document counts in batch
const fetchDocumentCounts = async (enquiryIds: string[]) => {
  try {
    const response = await fetch('/api/prospect-documents/counts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enquiry_ids: enquiryIds }),
    });
    if (response.ok) {
      const data = await response.json();
      // data = { "12345": 3, "12346": 0, "12347": 1 }
      setDocumentCounts(data);
    }
  } catch (error) {
    console.error('Failed to fetch document counts:', error);
  }
};

// Add state
const [documentCounts, setDocumentCounts] = useState<Record<string, number>>({});
```

Option B: **Individual fetch** (simpler but more API calls)
```typescript
// Fetch per enquiry in useEffect with debouncing
// Not recommended for large lists
```

#### 3.2 Pass documentCount to EnquiryLineItem

```typescript
<EnquiryLineItem
  key={enquiry.ID}
  enquiry={enquiry}
  onSelect={handleSelect}
  onRate={handleRate}
  // ... other props
  documentCount={documentCounts[enquiry.ID] || 0}  // NEW
/>
```

---

## API Endpoints to Create (instruct-pitch)

### 1. GET /api/prospect-documents/count

```typescript
// Lightweight count endpoint for list view
app.http('getProspectDocumentCount', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'prospect-documents/count',
  handler: async (request, context) => {
    const enquiryId = request.query.get('enquiry_id');
    if (!enquiryId) {
      return { status: 400, body: JSON.stringify({ error: 'enquiry_id required' }) };
    }
    
    const result = await sql`
      SELECT COUNT(*) as count 
      FROM JourneyDocuments 
      WHERE enquiry_id = ${enquiryId} AND is_deleted = 0
    `;
    
    return { 
      status: 200, 
      body: JSON.stringify({ count: result[0].count }),
      headers: { 'Content-Type': 'application/json' }
    };
  }
});
```

### 2. POST /api/prospect-documents/counts (batch)

```typescript
// Batch count endpoint for list view efficiency
app.http('getProspectDocumentCounts', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'prospect-documents/counts',
  handler: async (request, context) => {
    const body = await request.json();
    const enquiryIds = body.enquiry_ids || [];
    
    if (!enquiryIds.length) {
      return { status: 200, body: JSON.stringify({}) };
    }
    
    const placeholders = enquiryIds.map((_, i) => `@p${i}`).join(',');
    const result = await sql`
      SELECT enquiry_id, COUNT(*) as count 
      FROM JourneyDocuments 
      WHERE enquiry_id IN (${enquiryIds.join(',')}) AND is_deleted = 0
      GROUP BY enquiry_id
    `;
    
    const counts = {};
    result.forEach(row => {
      counts[row.enquiry_id] = row.count;
    });
    
    return { 
      status: 200, 
      body: JSON.stringify(counts),
      headers: { 'Content-Type': 'application/json' }
    };
  }
});
```

### 3. GET /api/prospect-documents

```typescript
// Full document list for timeline view
app.http('getProspectDocuments', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'prospect-documents',
  handler: async (request, context) => {
    const enquiryId = request.query.get('enquiry_id');
    if (!enquiryId) {
      return { status: 400, body: JSON.stringify({ error: 'enquiry_id required' }) };
    }
    
    const result = await sql`
      SELECT 
        id,
        enquiry_id,
        instruction_ref,
        blob_url,
        original_filename,
        file_size,
        content_type,
        document_type,
        uploaded_by,
        uploaded_at,
        stage_uploaded,
        notes
      FROM JourneyDocuments 
      WHERE enquiry_id = ${enquiryId} AND is_deleted = 0
      ORDER BY uploaded_at DESC
    `;
    
    return { 
      status: 200, 
      body: JSON.stringify(result),
      headers: { 'Content-Type': 'application/json' }
    };
  }
});
```

---

## Visual Design

### Brand Colors Used
- **Document accent**: `colours.accent` (#87F3F3) - Helix teal
- **Primary buttons**: `colours.highlight` (#3690CE) - Helix blue
- **Dark text on accent**: `colours.darkBlue` (#061733)

### Document Badge (EnquiryLineItem)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ [Enquiry Card]                                                             │
│                                                                            │
│  Name • email@example.com • £5,000 - £10,000                              │
│                                                                            │
│  [Pitch] [Call] [Email] [Teams] [📄 3] [Rate]                             │
│                                    ^^^^                                    │
│                                Document badge (teal accent)                │
└────────────────────────────────────────────────────────────────────────────┘
```

### Document Timeline Event (EnquiryTimeline)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Timeline                                                                   │
│                                                                            │
│  ● [Pitch] Pitch Sent - Initial engagement letter                         │
│  │  15 Dec 2025, 14:30 • John Smith                                       │
│  │                                                                        │
│  ● [Email] Re: Your enquiry                         ← RECEIVED            │
│  │  15 Dec 2025, 10:15 • client@example.com                              │
│  │                                                                        │
│  ● [📄] engagement-letter-signed.pdf                  (teal dot)          │
│  │  14 Dec 2025, 16:45 • john.smith@helix-law.com                        │
│  │  ┌─────────────────────────────────────────────┐                      │
│  │  │ engagement_letter • 245 KB • Uploaded at: enquiry                  │
│  │  │ [Preview]  ← Opens lightweight modal                               │
│  │  └─────────────────────────────────────────────┘                      │
│  │                                                                        │
│  ● [Call] Outbound call                                                   │
│     14 Dec 2025, 15:00 • 5 min                                           │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

### Document Preview Modal

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  📄 engagement-letter-signed.pdf                    [Download] [Close]     │
│     engagement letter • 245 KB                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │                     PDF/Image renders here                          │   │
│  │                     via iframe or <img>                             │   │
│  │                                                                     │   │
│  │                     For unsupported types:                          │   │
│  │                     "Preview not available"                         │   │
│  │                     [Download to view]                              │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Supported Preview Types:**
- PDF files → iframe embed
- Images (jpg, png, gif, webp) → `<img>` tag
- Other types → "Download to view" fallback

---

## Implementation Order

1. **Backend First** (instruct-pitch)
   - Create JourneyDocuments table (if not exists)
   - Implement `/api/prospect-documents` endpoint
   - Implement `/api/prospect-documents/count` endpoint
   - Implement `/api/prospect-documents/counts` batch endpoint

2. **EnquiryTimeline** (helix hub v1)
   - Add 'document' to CommunicationType
   - Add document metadata fields
   - Add loading state
   - Implement fetch in useEffect
   - Add icon/color/label functions
   - Add filter button
   - Add expanded content rendering

3. **EnquiryLineItem** (helix hub v1)
   - Add documentCount prop
   - Render badge

4. **Enquiries.tsx** (helix hub v1)
   - Fetch document counts
   - Pass to EnquiryLineItem

---

## Testing Checklist

- [ ] EnquiryLineItem shows badge when documentCount > 0
- [ ] EnquiryLineItem hides badge when documentCount = 0
- [ ] EnquiryTimeline fetches documents on load
- [ ] Documents appear in timeline sorted by date
- [ ] Document filter button works
- [ ] Document expanded view shows type, size, stage
- [ ] Download link opens blob URL
- [ ] Loading states work correctly
- [ ] Error handling for API failures

---

---

## Document Preview Modal

### State Management

```typescript
// Add to EnquiryTimeline state
const [previewDocument, setPreviewDocument] = useState<TimelineItem | null>(null);
```

### Preview Modal Component

```typescript
// Add DocumentPreviewModal component (can be in same file or separate)
interface DocumentPreviewModalProps {
  document: TimelineItem | null;
  onClose: () => void;
  isDarkMode: boolean;
}

const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({ document, onClose, isDarkMode }) => {
  if (!document || !document.metadata?.blobUrl) return null;
  
  const contentType = document.metadata.contentType || '';
  const isPdf = contentType.includes('pdf');
  const isImage = contentType.startsWith('image/');
  const filename = document.metadata.filename || 'Document';
  
  // Generate SAS URL via API (blob URLs need auth)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchPreviewUrl = async () => {
      try {
        setLoading(true);
        // API returns a time-limited SAS URL for preview
        const res = await fetch(`/api/prospect-documents/preview-url?id=${document.id.replace('document-', '')}`);
        if (res.ok) {
          const data = await res.json();
          setPreviewUrl(data.url);
        } else {
          setError('Failed to load preview');
        }
      } catch (err) {
        setError('Failed to load preview');
      } finally {
        setLoading(false);
      }
    };
    fetchPreviewUrl();
  }, [document.id]);
  
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: isDarkMode ? colours.dark.cardBackground : colours.light.cardBackground,
          borderRadius: '12px',
          width: '90%',
          maxWidth: '900px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '16px 20px',
            borderBottom: `1px solid ${isDarkMode ? colours.dark.border : colours.light.border}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <FaFileAlt style={{ color: colours.accent, fontSize: '18px' }} />
            <div>
              <div style={{
                fontWeight: 600,
                color: isDarkMode ? colours.dark.text : colours.light.text,
                fontSize: '14px',
              }}>
                {filename}
              </div>
              <div style={{
                fontSize: '11px',
                color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(15, 23, 42, 0.6)',
                marginTop: '2px',
              }}>
                {document.metadata.documentType?.replace(/_/g, ' ')} • {formatFileSize(document.metadata.fileSize || 0)}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {previewUrl && (
              <a
                href={previewUrl}
                download={filename}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 500,
                  background: colours.highlight,
                  color: '#ffffff',
                  textDecoration: 'none',
                }}
              >
                Download
              </a>
            )}
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500,
                background: isDarkMode ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.15)',
                color: isDarkMode ? colours.dark.text : colours.light.text,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Close
            </button>
          </div>
        </div>
        
        {/* Preview Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '400px',
          background: isDarkMode ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.03)',
        }}>
          {loading ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '32px',
                height: '32px',
                border: `3px solid ${colours.highlight}`,
                borderTopColor: 'transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto 12px',
              }} />
              <div style={{ color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(15, 23, 42, 0.6)', fontSize: '13px' }}>
                Loading preview...
              </div>
            </div>
          ) : error ? (
            <div style={{ textAlign: 'center', color: colours.cta }}>
              <FaInfoCircle style={{ fontSize: '24px', marginBottom: '8px' }} />
              <div>{error}</div>
            </div>
          ) : isPdf && previewUrl ? (
            <iframe
              src={previewUrl}
              style={{
                width: '100%',
                height: '100%',
                minHeight: '500px',
                border: 'none',
                borderRadius: '8px',
              }}
              title={filename}
            />
          ) : isImage && previewUrl ? (
            <img
              src={previewUrl}
              alt={filename}
              style={{
                maxWidth: '100%',
                maxHeight: '60vh',
                objectFit: 'contain',
                borderRadius: '8px',
              }}
            />
          ) : (
            <div style={{ textAlign: 'center' }}>
              <FaFileAlt style={{ fontSize: '48px', color: colours.accent, marginBottom: '16px' }} />
              <div style={{
                color: isDarkMode ? colours.dark.text : colours.light.text,
                fontSize: '14px',
                marginBottom: '8px',
              }}>
                Preview not available for this file type
              </div>
              <div style={{
                color: isDarkMode ? 'rgba(226, 232, 240, 0.6)' : 'rgba(15, 23, 42, 0.6)',
                fontSize: '12px',
              }}>
                {contentType || 'Unknown type'}
              </div>
              {previewUrl && (
                <a
                  href={previewUrl}
                  download={filename}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 20px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 500,
                    background: colours.highlight,
                    color: '#ffffff',
                    textDecoration: 'none',
                    marginTop: '16px',
                  }}
                >
                  Download to view
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
```

### Render Modal in EnquiryTimeline

```typescript
// At the end of EnquiryTimeline return, before closing fragment:
{previewDocument && (
  <DocumentPreviewModal
    document={previewDocument}
    onClose={() => setPreviewDocument(null)}
    isDarkMode={isDarkMode}
  />
)}
```

### API Endpoint for Preview URL

```typescript
// GET /api/prospect-documents/preview-url?id={documentId}
// Returns a time-limited SAS URL for secure preview

app.http('getProspectDocumentPreviewUrl', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'prospect-documents/preview-url',
  handler: async (request, context) => {
    const documentId = request.query.get('id');
    if (!documentId) {
      return { status: 400, body: JSON.stringify({ error: 'id required' }) };
    }
    
    // Get document blob info
    const [doc] = await sql`
      SELECT blob_name, container_name 
      FROM JourneyDocuments 
      WHERE id = ${documentId} AND is_deleted = 0
    `;
    
    if (!doc) {
      return { status: 404, body: JSON.stringify({ error: 'Document not found' }) };
    }
    
    // Generate SAS URL with 15-minute expiry
    const blobServiceClient = BlobServiceClient.fromConnectionString(process.env.AZURE_STORAGE_CONNECTION_STRING);
    const containerClient = blobServiceClient.getContainerClient(doc.container_name);
    const blobClient = containerClient.getBlobClient(doc.blob_name);
    
    const sasUrl = await blobClient.generateSasUrl({
      permissions: BlobSASPermissions.parse('r'), // Read only
      expiresOn: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
    });
    
    return { 
      status: 200, 
      body: JSON.stringify({ url: sasUrl }),
      headers: { 'Content-Type': 'application/json' }
    };
  }
});
```

---

## Future Enhancements

1. **Upload button** in timeline to add documents directly
2. **Document categories** (ID, engagement, compliance, other)
3. **Drag-and-drop** upload in EnquiryTimeline
4. **Document versioning** (replace with newer version)
5. **Full-screen preview mode** for detailed document review
