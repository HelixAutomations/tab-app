-- ============================================================================
-- Marketing Email Campaign Recipients + Demo Seed
-- Target: Helix Projects DB (PROJECTS_SQL_CONNECTION_STRING / helix-project-data)
-- Run after migrate-marketing-email-audience-spine.sql.
--
-- Purpose:
--   Add the fourth table in the Marketing Email spine and seed one isolated
--   demo scenario so demo mode can show a clear, navigable email setup without
--   surfacing live prototype audience rows.
-- ============================================================================

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID(N'dbo.marketing_email_audience_streams', N'U') IS NULL
BEGIN
    THROW 51000, 'Run tools/db/migrate-marketing-email-audience-spine.sql before this script.', 1;
END
GO

IF COL_LENGTH(N'dbo.marketing_email_audience_members', N'demo_seed') IS NULL
BEGIN
    ALTER TABLE dbo.marketing_email_audience_members
        ADD demo_seed BIT NOT NULL
            CONSTRAINT DF_marketing_email_audience_members_demo_seed DEFAULT (0);
    PRINT 'Added demo_seed to dbo.marketing_email_audience_members';
END
ELSE
    PRINT 'dbo.marketing_email_audience_members.demo_seed already exists - skipped';
GO

IF COL_LENGTH(N'dbo.marketing_email_campaigns', N'demo_seed') IS NULL
BEGIN
    ALTER TABLE dbo.marketing_email_campaigns
        ADD demo_seed BIT NOT NULL
            CONSTRAINT DF_marketing_email_campaigns_demo_seed DEFAULT (0);
    PRINT 'Added demo_seed to dbo.marketing_email_campaigns';
END
ELSE
    PRINT 'dbo.marketing_email_campaigns.demo_seed already exists - skipped';
GO

IF OBJECT_ID(N'dbo.marketing_email_campaign_recipients', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.marketing_email_campaign_recipients (
        recipient_id UNIQUEIDENTIFIER NOT NULL
            CONSTRAINT DF_marketing_email_campaign_recipients_recipient_id DEFAULT (NEWID()),
        campaign_id UNIQUEIDENTIFIER NOT NULL,
        member_id UNIQUEIDENTIFIER NULL,
        stream_key NVARCHAR(40) NOT NULL,

        acid NVARCHAR(120) NULL,
        source_enquiry_id NVARCHAR(120) NULL,
        email_hash CHAR(64) NULL,
        email_domain NVARCHAR(160) NULL,

        area_of_work NVARCHAR(160) NULL,
        [rank] TINYINT NULL,
        tags_json NVARCHAR(MAX) NULL,
        client BIT NOT NULL
            CONSTRAINT DF_marketing_email_campaign_recipients_client DEFAULT (0),
        client_status NVARCHAR(40) NULL,

        selection_status NVARCHAR(40) NOT NULL
            CONSTRAINT DF_marketing_email_campaign_recipients_selection_status DEFAULT (N'selected'),
        selection_reason NVARCHAR(300) NULL,
        send_status NVARCHAR(40) NOT NULL
            CONSTRAINT DF_marketing_email_campaign_recipients_send_status DEFAULT (N'not_sent'),
        sendgrid_message_id NVARCHAR(180) NULL,
        provider_status NVARCHAR(80) NULL,
        provider_error NVARCHAR(500) NULL,

        demo_seed BIT NOT NULL
            CONSTRAINT DF_marketing_email_campaign_recipients_demo_seed DEFAULT (0),
        snapshot_at DATETIME2(0) NOT NULL
            CONSTRAINT DF_marketing_email_campaign_recipients_snapshot_at DEFAULT (SYSUTCDATETIME()),
        created_at DATETIME2(0) NOT NULL
            CONSTRAINT DF_marketing_email_campaign_recipients_created_at DEFAULT (SYSUTCDATETIME()),
        created_by NVARCHAR(160) NULL,
        sent_at DATETIME2(0) NULL,
        updated_at DATETIME2(0) NULL,
        updated_by NVARCHAR(160) NULL,

        CONSTRAINT PK_marketing_email_campaign_recipients PRIMARY KEY (recipient_id),
        CONSTRAINT FK_marketing_email_campaign_recipients_campaign
            FOREIGN KEY (campaign_id) REFERENCES dbo.marketing_email_campaigns(campaign_id),
        CONSTRAINT FK_marketing_email_campaign_recipients_member
            FOREIGN KEY (member_id) REFERENCES dbo.marketing_email_audience_members(member_id),
        CONSTRAINT FK_marketing_email_campaign_recipients_stream
            FOREIGN KEY (stream_key) REFERENCES dbo.marketing_email_audience_streams(stream_key)
    );

    PRINT 'Created dbo.marketing_email_campaign_recipients table';
END
ELSE
    PRINT 'dbo.marketing_email_campaign_recipients table already exists - skipped';
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_marketing_email_campaign_recipients_stream')
BEGIN
    ALTER TABLE dbo.marketing_email_campaign_recipients
        ADD CONSTRAINT CK_marketing_email_campaign_recipients_stream
        CHECK (stream_key IN (N'commercial', N'construction', N'property', N'employment', N'other'));
    PRINT 'Created CK_marketing_email_campaign_recipients_stream';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_marketing_email_campaign_recipients_rank')
BEGIN
    ALTER TABLE dbo.marketing_email_campaign_recipients
        ADD CONSTRAINT CK_marketing_email_campaign_recipients_rank
        CHECK ([rank] IS NULL OR [rank] BETWEEN 0 AND 7);
    PRINT 'Created CK_marketing_email_campaign_recipients_rank';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_marketing_email_campaign_recipients_selection_status')
BEGIN
    ALTER TABLE dbo.marketing_email_campaign_recipients
        ADD CONSTRAINT CK_marketing_email_campaign_recipients_selection_status
        CHECK (selection_status IN (N'selected', N'blocked', N'skipped'));
    PRINT 'Created CK_marketing_email_campaign_recipients_selection_status';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_marketing_email_campaign_recipients_send_status')
BEGIN
    ALTER TABLE dbo.marketing_email_campaign_recipients
        ADD CONSTRAINT CK_marketing_email_campaign_recipients_send_status
        CHECK (send_status IN (N'not_sent', N'test_sent', N'queued', N'sending', N'sent', N'failed', N'skipped'));
    PRINT 'Created CK_marketing_email_campaign_recipients_send_status';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.marketing_email_audience_members') AND name = N'IX_marketing_email_audience_members_demo')
BEGIN
    CREATE INDEX IX_marketing_email_audience_members_demo
        ON dbo.marketing_email_audience_members (demo_seed, stream_key, sendable, [rank])
        INCLUDE (acid, source_enquiry_id, email_hash, email_domain, qualification_status, last_seen_at);
    PRINT 'Created IX_marketing_email_audience_members_demo';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.marketing_email_campaigns') AND name = N'IX_marketing_email_campaigns_demo')
BEGIN
    CREATE INDEX IX_marketing_email_campaigns_demo
        ON dbo.marketing_email_campaigns (demo_seed, stream_key, status, created_at DESC);
    PRINT 'Created IX_marketing_email_campaigns_demo';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.marketing_email_campaign_recipients') AND name = N'IX_marketing_email_campaign_recipients_campaign')
BEGIN
    CREATE INDEX IX_marketing_email_campaign_recipients_campaign
        ON dbo.marketing_email_campaign_recipients (campaign_id, selection_status, send_status)
        INCLUDE (member_id, stream_key, acid, email_domain, [rank], client);
    PRINT 'Created IX_marketing_email_campaign_recipients_campaign';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.marketing_email_campaign_recipients') AND name = N'IX_marketing_email_campaign_recipients_demo')
BEGIN
    CREATE INDEX IX_marketing_email_campaign_recipients_demo
        ON dbo.marketing_email_campaign_recipients (demo_seed, stream_key, selection_status, send_status);
    PRINT 'Created IX_marketing_email_campaign_recipients_demo';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.marketing_email_campaign_recipients') AND name = N'UX_marketing_email_campaign_recipients_campaign_member')
BEGIN
    CREATE UNIQUE INDEX UX_marketing_email_campaign_recipients_campaign_member
        ON dbo.marketing_email_campaign_recipients (campaign_id, member_id)
        WHERE member_id IS NOT NULL;
    PRINT 'Created UX_marketing_email_campaign_recipients_campaign_member';
END
GO

MERGE dbo.marketing_email_audience_members AS target
USING (VALUES (
    N'commercial',
    N'DEMO-AC-0003',
    N'DEMO-ENQ-0003',
    CONVERT(char(64), HASHBYTES('SHA2_256', LOWER(CONVERT(nvarchar(320), N'demo.marketing@helix.example'))), 2),
    N'helix.example',
    N'Commercial',
    CONVERT(tinyint, 2),
    N'["demo","commercial","2"]',
    CONVERT(bit, 0),
    NULL,
    N'prospect',
    N'qualified',
    N'Demo seed recipient for Marketing Email walkthrough',
    CONVERT(bit, 1),
    CONVERT(bit, 1)
)) AS source (
    stream_key, acid, source_enquiry_id, email_hash, email_domain, area_of_work, [rank], tags_json,
    client, matter_id, client_status, qualification_status, qualification_reason, sendable, demo_seed
)
ON target.source_enquiry_id = source.source_enquiry_id
WHEN MATCHED THEN UPDATE SET
    stream_key = source.stream_key,
    acid = source.acid,
    email_hash = source.email_hash,
    email_domain = source.email_domain,
    area_of_work = source.area_of_work,
    [rank] = source.[rank],
    tags_json = source.tags_json,
    client = source.client,
    matter_id = source.matter_id,
    client_status = source.client_status,
    qualification_status = source.qualification_status,
    qualification_reason = source.qualification_reason,
    sendable = source.sendable,
    demo_seed = source.demo_seed,
    last_seen_at = SYSUTCDATETIME(),
    last_qualified_at = SYSUTCDATETIME(),
    updated_at = SYSUTCDATETIME(),
    updated_by = N'demo-seed'
WHEN NOT MATCHED THEN INSERT (
    stream_key, acid, source_enquiry_id, email_hash, email_domain, area_of_work, [rank], tags_json,
    client, matter_id, client_status, qualification_status, qualification_reason, sendable,
    demo_seed, last_seen_at, last_qualified_at, created_by
)
VALUES (
    source.stream_key, source.acid, source.source_enquiry_id, source.email_hash, source.email_domain, source.area_of_work, source.[rank], source.tags_json,
    source.client, source.matter_id, source.client_status, source.qualification_status, source.qualification_reason, source.sendable,
    source.demo_seed, SYSUTCDATETIME(), SYSUTCDATETIME(), N'demo-seed'
);
GO

MERGE dbo.marketing_email_campaigns AS target
USING (VALUES (
    N'demo-marketing-email-setup',
    N'commercial',
    N'locked',
    N'Demo commercial update',
    N'Demo commercial update from Helix',
    N'A guarded walkthrough campaign for the email setup.',
    CONVERT(char(64), HASHBYTES('SHA2_256', CONVERT(nvarchar(max), N'Demo campaign body')), 2),
    N'automations@helix-law.com',
    N'data-hub-v2',
    CONVERT(bit, 1),
    CONVERT(tinyint, 0),
    CONVERT(tinyint, 4),
    1,
    0,
    0,
    CONVERT(bit, 1)
)) AS source (
    campaign_key, stream_key, status, campaign_name, subject, preheader, body_hash,
    sender_email, signature_mode, exclude_clients, rank_min, rank_max,
    selected_count, blocked_count, sent_count, demo_seed
)
ON target.campaign_key = source.campaign_key
WHEN MATCHED THEN UPDATE SET
    stream_key = source.stream_key,
    status = source.status,
    campaign_name = source.campaign_name,
    subject = source.subject,
    preheader = source.preheader,
    body_hash = source.body_hash,
    sender_email = source.sender_email,
    signature_mode = source.signature_mode,
    exclude_clients = source.exclude_clients,
    rank_min = source.rank_min,
    rank_max = source.rank_max,
    selected_count = source.selected_count,
    blocked_count = source.blocked_count,
    sent_count = source.sent_count,
    demo_seed = source.demo_seed,
    locked_at = COALESCE(target.locked_at, SYSUTCDATETIME()),
    locked_by = COALESCE(target.locked_by, N'demo-seed'),
    updated_at = SYSUTCDATETIME(),
    updated_by = N'demo-seed'
WHEN NOT MATCHED THEN INSERT (
    campaign_key, stream_key, status, campaign_name, subject, preheader, body_hash,
    sender_email, signature_mode, exclude_clients, rank_min, rank_max,
    selected_count, blocked_count, sent_count, demo_seed, created_by, locked_at, locked_by
)
VALUES (
    source.campaign_key, source.stream_key, source.status, source.campaign_name, source.subject, source.preheader, source.body_hash,
    source.sender_email, source.signature_mode, source.exclude_clients, source.rank_min, source.rank_max,
    source.selected_count, source.blocked_count, source.sent_count, source.demo_seed, N'demo-seed', SYSUTCDATETIME(), N'demo-seed'
);
GO

DECLARE @demoMemberId UNIQUEIDENTIFIER;
DECLARE @demoCampaignId UNIQUEIDENTIFIER;

SELECT @demoMemberId = member_id
FROM dbo.marketing_email_audience_members
WHERE source_enquiry_id = N'DEMO-ENQ-0003' AND demo_seed = 1;

SELECT @demoCampaignId = campaign_id
FROM dbo.marketing_email_campaigns
WHERE campaign_key = N'demo-marketing-email-setup' AND demo_seed = 1;

IF @demoMemberId IS NULL OR @demoCampaignId IS NULL
BEGIN
    THROW 51001, 'Demo campaign recipient seed failed because demo member or campaign was not found.', 1;
END

MERGE dbo.marketing_email_campaign_recipients AS target
USING (
    SELECT
        @demoCampaignId AS campaign_id,
        m.member_id,
        m.stream_key,
        m.acid,
        m.source_enquiry_id,
        m.email_hash,
        m.email_domain,
        m.area_of_work,
        m.[rank],
        m.tags_json,
        m.client,
        m.client_status,
        N'selected' AS selection_status,
        N'Demo seed selected recipient' AS selection_reason,
        N'not_sent' AS send_status,
        CONVERT(bit, 1) AS demo_seed
    FROM dbo.marketing_email_audience_members AS m
    WHERE m.member_id = @demoMemberId
) AS source
ON target.campaign_id = source.campaign_id AND target.member_id = source.member_id
WHEN MATCHED THEN UPDATE SET
    stream_key = source.stream_key,
    acid = source.acid,
    source_enquiry_id = source.source_enquiry_id,
    email_hash = source.email_hash,
    email_domain = source.email_domain,
    area_of_work = source.area_of_work,
    [rank] = source.[rank],
    tags_json = source.tags_json,
    client = source.client,
    client_status = source.client_status,
    selection_status = source.selection_status,
    selection_reason = source.selection_reason,
    send_status = source.send_status,
    demo_seed = source.demo_seed,
    snapshot_at = SYSUTCDATETIME(),
    updated_at = SYSUTCDATETIME(),
    updated_by = N'demo-seed'
WHEN NOT MATCHED THEN INSERT (
    campaign_id, member_id, stream_key, acid, source_enquiry_id, email_hash, email_domain,
    area_of_work, [rank], tags_json, client, client_status,
    selection_status, selection_reason, send_status, demo_seed, created_by
)
VALUES (
    source.campaign_id, source.member_id, source.stream_key, source.acid, source.source_enquiry_id, source.email_hash, source.email_domain,
    source.area_of_work, source.[rank], source.tags_json, source.client, source.client_status,
    source.selection_status, source.selection_reason, source.send_status, source.demo_seed, N'demo-seed'
);

PRINT 'Seeded Marketing Email demo member, campaign, and campaign recipient snapshot';
GO

SELECT
    (SELECT COUNT(*) FROM dbo.marketing_email_audience_members WHERE demo_seed = 1) AS demo_members,
    (SELECT COUNT(*) FROM dbo.marketing_email_campaigns WHERE demo_seed = 1) AS demo_campaigns,
    (SELECT COUNT(*) FROM dbo.marketing_email_campaign_recipients WHERE demo_seed = 1) AS demo_campaign_recipients;
GO

PRINT 'Marketing email campaign recipients migration and demo seed complete';
GO