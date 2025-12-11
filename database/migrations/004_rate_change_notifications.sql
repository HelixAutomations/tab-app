-- Migration: Create rate_change_notifications table
-- Database: instructions
-- Date: 2024-12-08
-- Purpose: Track hourly rate increase notifications to clients

CREATE TABLE rate_change_notifications (
    id INT IDENTITY(1,1) PRIMARY KEY,
    
    -- Rate change period
    rate_change_year INT NOT NULL,
    effective_date DATE NOT NULL,
    
    -- Client (denormalized for display)
    client_id NVARCHAR(50) NOT NULL,
    client_first_name NVARCHAR(100),
    client_last_name NVARCHAR(100),
    client_email NVARCHAR(255),
    
    -- Matters covered (IDs and display numbers only)
    matter_ids NVARCHAR(MAX),           -- JSON array: ["123","456"]
    display_numbers NVARCHAR(MAX),      -- JSON array: ["ITEM123-001","ITEM456-001"]
    
    -- Status tracking
    status NVARCHAR(20) NOT NULL,       -- 'sent' or 'not_applicable'
    sent_date DATE NULL,
    sent_by NVARCHAR(100) NULL,
    
    -- N/A cases
    na_reason NVARCHAR(50) NULL,        -- 'multi_matter', 'dormant', 'fixed_fee', 'other'
    na_notes NVARCHAR(500) NULL,
    
    -- Audit
    created_at DATETIME2 DEFAULT GETDATE(),
    updated_at DATETIME2 DEFAULT GETDATE(),
    
    -- One record per client per year
    CONSTRAINT UQ_rate_change_client_year UNIQUE (rate_change_year, client_id)
);

-- Index for filtering by year and status
CREATE INDEX IX_rate_change_year_status ON rate_change_notifications (rate_change_year, status);

-- Index for looking up by client
CREATE INDEX IX_rate_change_client ON rate_change_notifications (client_id);
