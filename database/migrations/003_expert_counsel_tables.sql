-- Migration: Create expert_recommendations and counsel_recommendations tables
-- Date: 2024-12-11
-- Database: helix_projects

-- Expert Recommendations Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'expert_recommendations')
BEGIN
    CREATE TABLE expert_recommendations (
        id INT IDENTITY(1,1) PRIMARY KEY,
        created_at DATETIME2 DEFAULT GETUTCDATE(),
        submitted_by NVARCHAR(10),           -- initials of submitter
        
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
    
    CREATE INDEX IX_expert_recommendations_area ON expert_recommendations(area_of_work);
    CREATE INDEX IX_expert_recommendations_worktype ON expert_recommendations(worktype);
    CREATE INDEX IX_expert_recommendations_status ON expert_recommendations(status);
    
    PRINT 'Created expert_recommendations table';
END
ELSE
BEGIN
    PRINT 'expert_recommendations table already exists';
END
GO

-- Counsel Recommendations Table
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'counsel_recommendations')
BEGIN
    CREATE TABLE counsel_recommendations (
        id INT IDENTITY(1,1) PRIMARY KEY,
        created_at DATETIME2 DEFAULT GETUTCDATE(),
        submitted_by NVARCHAR(10),            -- initials of submitter
        
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
    
    CREATE INDEX IX_counsel_recommendations_area ON counsel_recommendations(area_of_work);
    CREATE INDEX IX_counsel_recommendations_worktype ON counsel_recommendations(worktype);
    CREATE INDEX IX_counsel_recommendations_price ON counsel_recommendations(price_tier);
    CREATE INDEX IX_counsel_recommendations_status ON counsel_recommendations(status);
    
    PRINT 'Created counsel_recommendations table';
END
ELSE
BEGIN
    PRINT 'counsel_recommendations table already exists';
END
GO
