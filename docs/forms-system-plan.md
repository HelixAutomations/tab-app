# Forms System Redesign - Planning Document

**Created:** 2024-12-11  
**Status:** Planning  
**Owner:** LZ (Tech Lead)

---

## Overview

Redesign the Forms tab to include internal tooling forms and professional directories, with SQL-backed storage and Asana integration for task creation.

---

## TO DO Checklist

### Phase 1: Database Setup
- [ ] Create `expert_recommendations` table in helix_projects DB
- [ ] Create `counsel_recommendations` table in helix_projects DB
- [ ] Test table schemas with sample data

**Migration file created:** `database/migrations/003_expert_counsel_tables.sql`

### Phase 2: Server Routes (Backend)
- [x] `server/routes/experts.js` - CRUD for expert recommendations (SQL)
- [x] `server/routes/counsel.js` - CRUD for counsel recommendations (SQL)
- [x] `server/routes/techTickets.js` - Create Asana tasks for tech ideas/problems
- [x] Register routes in `server/index.js`
- [ ] Configure `ASANA_ACCESS_TOKEN` in environment
- [ ] Configure `ASANA_TECH_PROJECT_ID` in environment (or fetch dynamically)

**Note:** Using Express server routes (not Azure Functions). Routes registered in `server/index.js`.

### Phase 3: Frontend Forms
- [ ] `TechIdeaForm.tsx` - Tech idea submission form
- [ ] `TechProblemForm.tsx` - Technical problem report form
- [ ] `ExpertRecommendationForm.tsx` - Expert submission form
- [ ] `CounselRecommendationForm.tsx` - Counsel submission form
- [ ] Shared: Area of Work → Worktype cascading dropdown component

### Phase 4: Frontend Directories
- [ ] `ExpertDirectory.tsx` - View/filter/search experts
- [ ] `CounselDirectory.tsx` - View/filter/search counsel
- [ ] Export to CSV functionality

### Phase 5: Forms Tab Restructure
- [ ] Add "Internal Tools" section to formsData.ts
- [ ] Add "Directories" section to formsData.ts
- [ ] Update Forms.tsx layout for new sections

### Phase 6: Polish & Testing
- [ ] Test all form submissions
- [ ] Test directory filtering/search
- [ ] Test Asana task creation
- [ ] Dark mode styling verification

---

## Decisions Made

| Topic | Decision | Notes |
|-------|----------|-------|
| Storage | SQL tables (not CSVs) | Queryable, filterable, auditable |
| Forms | Custom React (not Cognito) | Consistent UX, full control |
| Styling | Match NotableCaseInfoForm | Clean, professional |
| Asana | Direct API via Azure Function | Use existing Asana IDs from UserData |

---

## Open Questions

| # | Question | Answer | Status |
|---|----------|--------|--------|
| 1 | CV file storage - Azure Blob, SharePoint, or URL links? | | Pending |
| 2 | Approval workflow - Live immediately or moderated? | | Pending |
| 3 | Directory edit permissions - Admins only? | | Pending |
| 4 | Existing data to migrate? | | Pending |
| 5 | Source field - Editable or locked to submitter? | | Pending |

---

## Database Schemas

### expert_recommendations
```sql
CREATE TABLE expert_recommendations (
    id INT IDENTITY(1,1) PRIMARY KEY,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    submitted_by NVARCHAR(10),           -- initials
    
    -- Identity
    prefix NVARCHAR(20),                  -- Mr/Mrs/Ms/Dr/Prof (optional)
    first_name NVARCHAR(100) NOT NULL,
    last_name NVARCHAR(100) NOT NULL,
    company_name NVARCHAR(200),
    company_number NVARCHAR(20),          -- Companies House ref
    
    -- Contact
    email NVARCHAR(200),
    phone NVARCHAR(50),
    website NVARCHAR(500),
    cv_url NVARCHAR(500),
    
    -- Categorization
    area_of_work NVARCHAR(50) NOT NULL,   -- Commercial/Property/Construction/Employment
    worktype NVARCHAR(100) NOT NULL,      -- Specific type within area
    
    -- Attribution
    introduced_by NVARCHAR(200),          -- Who found/recommended them
    source NVARCHAR(50),                  -- "{initials} following"
    
    -- Feedback
    notes NVARCHAR(MAX),
    
    -- Status
    status NVARCHAR(20) DEFAULT 'active'  -- active/archived
);
```

### counsel_recommendations
```sql
CREATE TABLE counsel_recommendations (
    id INT IDENTITY(1,1) PRIMARY KEY,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    submitted_by NVARCHAR(10),
    
    -- Identity
    prefix NVARCHAR(20),
    first_name NVARCHAR(100) NOT NULL,
    last_name NVARCHAR(100) NOT NULL,
    chambers_name NVARCHAR(200),
    
    -- Contact
    email NVARCHAR(200) NOT NULL,
    clerks_email NVARCHAR(200),
    phone NVARCHAR(50),
    website NVARCHAR(500),
    
    -- Categorization
    area_of_work NVARCHAR(50) NOT NULL,
    worktype NVARCHAR(100) NOT NULL,
    
    -- Attribution
    introduced_by NVARCHAR(200),
    source NVARCHAR(50),
    
    -- Feedback
    notes NVARCHAR(MAX),
    price_tier NVARCHAR(20) NOT NULL,     -- cheap/mid/expensive
    
    -- Status
    status NVARCHAR(20) DEFAULT 'active'
);
```

---

## Form Specifications

### Tech Idea Submission
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Title | text | ✓ | Short summary |
| Description | textarea | ✓ | Full idea explanation |
| Priority | dropdown | ✓ | Low/Medium/High |
| Area | dropdown | | Hub/Email/Other |

**Creates:** Asana task in Tech project with LZ as collaborator

### Technical Problem Report
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| System | dropdown | ✓ | Hub/Email/Clio/NetDocs/Asana/Other |
| Summary | text | ✓ | Brief description |
| Steps to Reproduce | textarea | | What were you doing |
| Expected vs Actual | textarea | ✓ | What went wrong |
| Urgency | dropdown | ✓ | Blocking/Annoying/Minor |

**Creates:** Asana task assigned to LZ, CB, KW

### Expert Recommendation
| Field | Type | Required | Default |
|-------|------|----------|---------|
| Prefix | dropdown | | — |
| First Name | text | ✓ | — |
| Last Name | text | ✓ | — |
| Company Name | text | | — |
| Company Number | text | | — |
| Email | text | | — |
| Phone | text | | — |
| Website | text | | — |
| CV | file/link | | — |
| Area of Work | dropdown | ✓ | — |
| Worktype | dropdown | ✓ | (cascades from Area) |
| Introduced By | text | | — |
| Source | text | | `{user initials} following` |
| Notes | textarea | | — |

### Counsel Recommendation
| Field | Type | Required | Default |
|-------|------|----------|---------|
| Prefix | dropdown | | — |
| First Name | text | ✓ | — |
| Last Name | text | ✓ | — |
| Chambers Name | text | | — |
| Email | text | ✓ | — |
| Clerks Email | text | | — |
| Phone | text | | — |
| Website | text | | — |
| Area of Work | dropdown | ✓ | — |
| Worktype | dropdown | ✓ | (cascades from Area) |
| Introduced By | text | | — |
| Source | text | | `{user initials} following` |
| Notes | textarea | | — |
| Price Tier | dropdown | ✓ | Cheap/Mid-range/Expensive |

---

## Forms Tab Structure (Target)

```
Forms Tab
├── 📁 Internal Tools (NEW)
│   ├── 💡 Submit Tech Idea
│   ├── 🔧 Report Technical Problem  
│   ├── 👤 Recommend an Expert
│   └── ⚖️ Recommend Counsel
│
├── 📋 Directories (NEW)
│   ├── 📖 Expert Directory (view/filter)
│   └── 📖 Counsel Directory (view/filter)
│
├── 📁 General Processes (existing)
├── 📁 Operations (existing)
└── 📁 Financial (existing)
```

---

## Area of Work → Worktype Mapping

Uses existing `practiceAreasByArea` from `src/tabs/instructions/MatterOpening/config.ts`:

| Area of Work | Worktypes |
|--------------|-----------|
| Commercial | Commercial, Director Rights & Dispute Advice, Shareholder Rights & Dispute Advice, Civil/Commercial Fraud Advice, Partnership Advice, Business Contract Dispute, Unpaid Loan Recovery, Contentious Probate, Statutory Demand - Drafting/Advising, Winding Up Petition Advice, Bankruptcy Petition Advice, Injunction Advice, Intellectual Property, Professional Negligence, Unpaid Invoice/Debt Dispute, Commercial Contract - Drafting, Company Restoration, Small Claim Advice, Trust Advice, Terms and Conditions - Drafting, Miscellaneous |
| Construction | Final Account Recovery, Retention Recovery Advice, Adjudication Advice & Dispute, Construction Contract Advice, Interim Payment Recovery, Contract Dispute, Miscellaneous |
| Property | Landlord & Tenant (Commercial/Residential), Boundary and Nuisance Advice, Trust of Land (TOLATA) Advice, Service Charge Recovery & Dispute Advice, Breach of Lease Advice, Terminal Dilapidations Advice, Investment Sale and Ownership Advice, Trespass, Right of Way, Miscellaneous |
| Employment | Employment Contract - Drafting, Employment Retainer Instruction, Settlement Agreement - Drafting/Advising, Handbook - Drafting, Tribunal claims, Redundancy, Discrimination, Whistleblowing, TUPE, Miscellaneous |

---

## Asana Integration

### Workspace ID
`1203336030510557` (Helix workspace)

### User IDs (from team database)
| Person | Initials | ASANAUser_ID |
|--------|----------|--------------|
| Lukasz Zemanek | LZ | 1203336817680917 |
| Kanchel White | KW | 1203336030510561 |
| Cass | CB | TBD - query from team table |

### Project ID
**TODO:** Configure `ASANA_TECH_PROJECT_ID` environment variable
- Use `/api/tech-tickets/projects` endpoint to list available projects
- LZ's team project ID: `1204962032378888` (used as default)

---

## Notes

- All forms use premium styling matching NotableCaseInfoForm
- No "AI feel" - clean, professional, readable
- Source field defaults to `{current user initials} following` but is editable
- Directories are read-only initially; edit via re-submission or future enhancement
