-- ============================================================================
-- Marketing Email Audience Spine
-- Target: Helix Projects DB (PROJECTS_SQL_CONNECTION_STRING / helix-project-data)
-- Run once. Idempotent guards are included for tables, indexes, constraints,
-- and seed stream rows.
--
-- Purpose:
--   Stand up the first governed Email audience spine for SendGrid prototype
--   work. The four live streams are area-of-work silos. The other stream is
--   inspection-only and is not a live campaign key, even when an ACID exists.
-- ============================================================================

IF OBJECT_ID(N'dbo.marketing_email_audience_streams', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.marketing_email_audience_streams (
        stream_key NVARCHAR(40) NOT NULL,
        label NVARCHAR(120) NOT NULL,
        is_sendable BIT NOT NULL
            CONSTRAINT DF_marketing_email_audience_streams_is_sendable DEFAULT (0),
        sort_order INT NOT NULL
            CONSTRAINT DF_marketing_email_audience_streams_sort_order DEFAULT (0),
        status NVARCHAR(30) NOT NULL
            CONSTRAINT DF_marketing_email_audience_streams_status DEFAULT (N'active'),
        created_at DATETIME2(0) NOT NULL
            CONSTRAINT DF_marketing_email_audience_streams_created_at DEFAULT (SYSUTCDATETIME()),
        updated_at DATETIME2(0) NULL,

        CONSTRAINT PK_marketing_email_audience_streams PRIMARY KEY (stream_key)
    );

    PRINT 'Created dbo.marketing_email_audience_streams table';
END
ELSE
    PRINT 'dbo.marketing_email_audience_streams table already exists - skipped';
GO

IF OBJECT_ID(N'dbo.marketing_email_audience_members', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.marketing_email_audience_members (
        member_id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT DF_marketing_email_audience_members_member_id DEFAULT (NEWID()),
        stream_key NVARCHAR(40) NOT NULL,

        acid NVARCHAR(120) NULL,
        source_enquiry_id NVARCHAR(120) NULL,

        email_hash CHAR(64) NULL,
        email_domain NVARCHAR(160) NULL,

        area_of_work NVARCHAR(160) NULL,
        [rank] TINYINT NULL,
        tags_json NVARCHAR(MAX) NULL,

        client BIT NOT NULL
            CONSTRAINT DF_marketing_email_audience_members_client DEFAULT (0),
        matter_id NVARCHAR(120) NULL,
        client_status NVARCHAR(40) NULL,

        qualification_status NVARCHAR(40) NOT NULL,
        qualification_reason NVARCHAR(300) NULL,

        sendable BIT NOT NULL
            CONSTRAINT DF_marketing_email_audience_members_sendable DEFAULT (0),
        last_seen_at DATETIME2(0) NOT NULL
            CONSTRAINT DF_marketing_email_audience_members_last_seen_at DEFAULT (SYSUTCDATETIME()),
        last_qualified_at DATETIME2(0) NULL,

        created_at DATETIME2(0) NOT NULL
            CONSTRAINT DF_marketing_email_audience_members_created_at DEFAULT (SYSUTCDATETIME()),
        created_by NVARCHAR(160) NULL,
        updated_at DATETIME2(0) NULL,
        updated_by NVARCHAR(160) NULL,

        CONSTRAINT PK_marketing_email_audience_members PRIMARY KEY (member_id),
        CONSTRAINT FK_marketing_email_audience_members_stream
            FOREIGN KEY (stream_key) REFERENCES dbo.marketing_email_audience_streams(stream_key)
    );

    PRINT 'Created dbo.marketing_email_audience_members table';
END
ELSE
    PRINT 'dbo.marketing_email_audience_members table already exists - skipped';
GO

IF OBJECT_ID(N'dbo.marketing_email_campaigns', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.marketing_email_campaigns (
        campaign_id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT DF_marketing_email_campaigns_campaign_id DEFAULT (NEWID()),
        campaign_key NVARCHAR(120) NULL,
        stream_key NVARCHAR(40) NOT NULL,

        status NVARCHAR(40) NOT NULL
            CONSTRAINT DF_marketing_email_campaigns_status DEFAULT (N'draft'),
        campaign_name NVARCHAR(160) NOT NULL,
        subject NVARCHAR(300) NULL,
        preheader NVARCHAR(300) NULL,
        body_hash CHAR(64) NULL,

        sender_email NVARCHAR(255) NULL,
        signature_mode NVARCHAR(60) NULL,

        exclude_clients BIT NOT NULL
            CONSTRAINT DF_marketing_email_campaigns_exclude_clients DEFAULT (1),
        rank_min TINYINT NULL,
        rank_max TINYINT NULL,

        selected_count INT NULL,
        blocked_count INT NULL,
        sent_count INT NULL,

        sendgrid_batch_id NVARCHAR(180) NULL,
        sendgrid_message_id NVARCHAR(180) NULL,

        created_at DATETIME2(0) NOT NULL
            CONSTRAINT DF_marketing_email_campaigns_created_at DEFAULT (SYSUTCDATETIME()),
        created_by NVARCHAR(160) NULL,
        locked_at DATETIME2(0) NULL,
        locked_by NVARCHAR(160) NULL,
        sent_at DATETIME2(0) NULL,
        sent_by NVARCHAR(160) NULL,
        updated_at DATETIME2(0) NULL,
        updated_by NVARCHAR(160) NULL,

        CONSTRAINT PK_marketing_email_campaigns PRIMARY KEY (campaign_id),
        CONSTRAINT FK_marketing_email_campaigns_stream
            FOREIGN KEY (stream_key) REFERENCES dbo.marketing_email_audience_streams(stream_key)
    );

    PRINT 'Created dbo.marketing_email_campaigns table';
END
ELSE
    PRINT 'dbo.marketing_email_campaigns table already exists - skipped';
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_marketing_email_audience_streams_key')
BEGIN
    ALTER TABLE dbo.marketing_email_audience_streams
        ADD CONSTRAINT CK_marketing_email_audience_streams_key
        CHECK (stream_key IN (N'commercial', N'construction', N'property', N'employment', N'other'));
    PRINT 'Created CK_marketing_email_audience_streams_key';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_marketing_email_audience_streams_status')
BEGIN
    ALTER TABLE dbo.marketing_email_audience_streams
        ADD CONSTRAINT CK_marketing_email_audience_streams_status
        CHECK (status IN (N'active', N'paused', N'retired'));
    PRINT 'Created CK_marketing_email_audience_streams_status';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_marketing_email_audience_members_stream')
BEGIN
    ALTER TABLE dbo.marketing_email_audience_members
        ADD CONSTRAINT CK_marketing_email_audience_members_stream
        CHECK (stream_key IN (N'commercial', N'construction', N'property', N'employment', N'other'));
    PRINT 'Created CK_marketing_email_audience_members_stream';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_marketing_email_audience_members_rank')
BEGIN
    ALTER TABLE dbo.marketing_email_audience_members
        ADD CONSTRAINT CK_marketing_email_audience_members_rank
        CHECK ([rank] IS NULL OR [rank] BETWEEN 0 AND 7);
    PRINT 'Created CK_marketing_email_audience_members_rank';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_marketing_email_audience_members_status')
BEGIN
    ALTER TABLE dbo.marketing_email_audience_members
        ADD CONSTRAINT CK_marketing_email_audience_members_status
        CHECK (qualification_status IN (N'qualified', N'inspect', N'blocked', N'missing_acid', N'missing_email', N'client_excluded', N'suppressed'));
    PRINT 'Created CK_marketing_email_audience_members_status';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_marketing_email_audience_members_client_status')
BEGIN
    ALTER TABLE dbo.marketing_email_audience_members
        ADD CONSTRAINT CK_marketing_email_audience_members_client_status
        CHECK (client_status IS NULL OR client_status IN (N'client', N'prospect', N'unknown', N'excluded'));
    PRINT 'Created CK_marketing_email_audience_members_client_status';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_marketing_email_campaigns_stream')
BEGIN
    ALTER TABLE dbo.marketing_email_campaigns
        ADD CONSTRAINT CK_marketing_email_campaigns_stream
        CHECK (stream_key IN (N'commercial', N'construction', N'property', N'employment'));
    PRINT 'Created CK_marketing_email_campaigns_stream';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_marketing_email_campaigns_status')
BEGIN
    ALTER TABLE dbo.marketing_email_campaigns
        ADD CONSTRAINT CK_marketing_email_campaigns_status
        CHECK (status IN (N'draft', N'locked', N'test_sent', N'sending', N'sent', N'cancelled'));
    PRINT 'Created CK_marketing_email_campaigns_status';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_marketing_email_campaigns_rank')
BEGIN
    ALTER TABLE dbo.marketing_email_campaigns
        ADD CONSTRAINT CK_marketing_email_campaigns_rank
        CHECK (
            (rank_min IS NULL OR rank_min BETWEEN 0 AND 7)
            AND (rank_max IS NULL OR rank_max BETWEEN 0 AND 7)
            AND (rank_min IS NULL OR rank_max IS NULL OR rank_min <= rank_max)
        );
    PRINT 'Created CK_marketing_email_campaigns_rank';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.marketing_email_audience_streams') AND name = N'IX_marketing_email_audience_streams_status')
BEGIN
    CREATE INDEX IX_marketing_email_audience_streams_status
        ON dbo.marketing_email_audience_streams (status, sort_order);
    PRINT 'Created IX_marketing_email_audience_streams_status';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.marketing_email_audience_members') AND name = N'IX_marketing_email_audience_members_selector')
BEGIN
    CREATE INDEX IX_marketing_email_audience_members_selector
        ON dbo.marketing_email_audience_members (stream_key, sendable, [rank])
        INCLUDE (acid, client, matter_id, qualification_status, last_seen_at);
    PRINT 'Created IX_marketing_email_audience_members_selector';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.marketing_email_audience_members') AND name = N'IX_marketing_email_audience_members_acid')
BEGIN
    CREATE INDEX IX_marketing_email_audience_members_acid
        ON dbo.marketing_email_audience_members (acid)
        WHERE acid IS NOT NULL;
    PRINT 'Created IX_marketing_email_audience_members_acid';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.marketing_email_audience_members') AND name = N'IX_marketing_email_audience_members_client')
BEGIN
    CREATE INDEX IX_marketing_email_audience_members_client
        ON dbo.marketing_email_audience_members (client, matter_id)
        WHERE client = 1 OR matter_id IS NOT NULL;
    PRINT 'Created IX_marketing_email_audience_members_client';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.marketing_email_audience_members') AND name = N'IX_marketing_email_audience_members_last_seen')
BEGIN
    CREATE INDEX IX_marketing_email_audience_members_last_seen
        ON dbo.marketing_email_audience_members (last_seen_at DESC);
    PRINT 'Created IX_marketing_email_audience_members_last_seen';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.marketing_email_audience_members') AND name = N'UX_marketing_email_audience_members_stream_acid')
BEGIN
    CREATE UNIQUE INDEX UX_marketing_email_audience_members_stream_acid
        ON dbo.marketing_email_audience_members (stream_key, acid)
        WHERE acid IS NOT NULL;
    PRINT 'Created UX_marketing_email_audience_members_stream_acid';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.marketing_email_audience_members') AND name = N'IX_marketing_email_audience_members_email_hash')
BEGIN
    CREATE INDEX IX_marketing_email_audience_members_email_hash
        ON dbo.marketing_email_audience_members (email_hash)
        WHERE email_hash IS NOT NULL;
    PRINT 'Created IX_marketing_email_audience_members_email_hash';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.marketing_email_campaigns') AND name = N'IX_marketing_email_campaigns_stream_status')
BEGIN
    CREATE INDEX IX_marketing_email_campaigns_stream_status
        ON dbo.marketing_email_campaigns (stream_key, status, created_at DESC);
    PRINT 'Created IX_marketing_email_campaigns_stream_status';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.marketing_email_campaigns') AND name = N'UX_marketing_email_campaigns_key')
BEGIN
    CREATE UNIQUE INDEX UX_marketing_email_campaigns_key
        ON dbo.marketing_email_campaigns (campaign_key)
        WHERE campaign_key IS NOT NULL;
    PRINT 'Created UX_marketing_email_campaigns_key';
END
GO

MERGE dbo.marketing_email_audience_streams AS target
USING (VALUES
    (N'commercial', N'Commercial', CONVERT(bit, 1), 10, N'active'),
    (N'construction', N'Construction', CONVERT(bit, 1), 20, N'active'),
    (N'property', N'Property', CONVERT(bit, 1), 30, N'active'),
    (N'employment', N'Employment', CONVERT(bit, 1), 40, N'active'),
    (N'other', N'Other', CONVERT(bit, 0), 90, N'active')
) AS source (stream_key, label, is_sendable, sort_order, status)
ON target.stream_key = source.stream_key
WHEN MATCHED THEN UPDATE SET
    label = source.label,
    is_sendable = source.is_sendable,
    sort_order = source.sort_order,
    status = source.status,
    updated_at = SYSUTCDATETIME()
WHEN NOT MATCHED THEN INSERT (stream_key, label, is_sendable, sort_order, status)
    VALUES (source.stream_key, source.label, source.is_sendable, source.sort_order, source.status);
GO

PRINT 'Marketing email audience spine migration complete';
GO