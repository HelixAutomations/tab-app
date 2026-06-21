-- ============================================================================
-- Marketing Attribution Chain Spine
-- Target: Instructions DB (INSTRUCTIONS_SQL_CONNECTION_STRING)
-- Run once. Idempotent guards are included for table, indexes, and constraints.
--
-- Purpose:
--   Hard-link the Data Hub attribution chain without copying granular source
--   records. Full payment, identity, risk, matter, enquiry, and collected-value
--   detail should be fetched from source tables by the ids stored here.
-- ============================================================================

IF OBJECT_ID(N'dbo.marketing_attribution_chain', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.marketing_attribution_chain (
        -- Spine row id.
        id BIGINT IDENTITY(1,1) NOT NULL,

        -- Corrected reporting channel assigned by Data Hub.
        -- Examples: SEO, PPC, Email, Referral, Direct, Unknown.
        source_channel NVARCHAR(40) NULL,

        -- Corrected raw source value.
        -- Examples: Organic search, Paid search, Existing client referral.
        source_value NVARCHAR(160) NULL,

        -- Optional source detail for campaign, referrer, or LLM marker.
        -- Keep human-readable. Do not store client narrative here.
        source_detail NVARCHAR(500) NULL,

        -- How the enquiry entered the business.
        -- Examples: call, form, email, manual, unknown.
        intake_type NVARCHAR(40) NULL,

        -- Intake evidence ids. Usually only one is populated.
        call_id NVARCHAR(120) NULL,
        form_submission_id NVARCHAR(120) NULL,
        email_thread_id NVARCHAR(180) NULL,

        -- When the intake happened.
        intake_at DATETIME2(0) NULL,

        -- Enquiry/prospect id. This is the main Data Hub/Prospects join point.
        enquiry_id NVARCHAR(120) NULL,

        -- When the enquiry/prospect was created.
        enquiry_at DATETIME2(0) NULL,

        -- Current or claim owner at enquiry stage.
        enquiry_owner NVARCHAR(160) NULL,

        -- Safe Prospects create-enquiry metadata for routing and reporting.
        -- Do not store client narrative or contact details here.
        enquiry_contact_method NVARCHAR(80) NULL,
        enquiry_area_of_work NVARCHAR(160) NULL,

        -- Pitch/deal id.
        pitch_id NVARCHAR(120) NULL,

        -- When the pitch was sent or created.
        pitch_at DATETIME2(0) NULL,

        -- Pitch/deal status.
        -- Examples from the workbench: pitched, accepted, instructed, expired, declined.
        pitch_status NVARCHAR(60) NULL,

        -- Person who pitched.
        pitched_by NVARCHAR(160) NULL,

        -- Commercial amount quoted at pitch/deal stage.
        -- This is quoted value, not proof of payment.
        deal_amount DECIMAL(18,2) NULL,

        -- Instruction reference. This becomes the hard join for workbench records.
        instruction_ref NVARCHAR(120) NULL,

        -- When the instruction was submitted or created.
        instruction_at DATETIME2(0) NULL,

        -- Instruction stage from the workbench.
        -- Examples: initialised, proof-of-id-complete, completed, matter-opened.
        instruction_stage NVARCHAR(80) NULL,

        -- Instruction owner/contact.
        instruction_owner NVARCHAR(160) NULL,

        -- Client id only. Do not store client name in this spine.
        client_id NVARCHAR(120) NULL,

        -- Client shape needed for reporting and matter opening flow.
        -- Normalise source values into the constraint vocabulary below.
        client_type NVARCHAR(40) NULL,

        -- Identity check id. Full granular details stay in the EID source table.
        identity_check_id NVARCHAR(120) NULL,

        -- Overall identity result.
        -- Examples: passed, approved, verified, refer, review, failed.
        identity_check_result NVARCHAR(120) NULL,

        -- Workbench-derived identity stage.
        -- Live workbench vocabulary: pending, processing, review, complete.
        identity_check_status NVARCHAR(40) NULL,

        -- When the identity check was completed or last materially updated.
        identity_check_at DATETIME2(0) NULL,

        -- Risk assessment id. Full granular details stay in the risk source table.
        risk_assessment_id NVARCHAR(120) NULL,

        -- Overall risk result.
        -- Examples: low, medium, high, approved.
        risk_assessment_result NVARCHAR(120) NULL,

        -- Workbench-derived risk stage.
        -- Live workbench vocabulary: pending, warning, review, complete.
        risk_assessment_status NVARCHAR(40) NULL,

        -- When the risk assessment was completed or last materially updated.
        risk_assessment_at DATETIME2(0) NULL,

        -- Payment id. Full granular payment details stay in Payments.
        payment_id NVARCHAR(120) NULL,

        -- Payment method summary only.
        -- Examples: card, bank_transfer, mixed, unknown.
        payment_method NVARCHAR(40) NULL,

        -- Payment status summary only.
        -- Examples: pending, processing, succeeded, confirmed, failed, paid.
        payment_status NVARCHAR(40) NULL,

        -- Amount actually paid or confirmed against this chain.
        -- Fetch Payments for line-level detail.
        payment_amount DECIMAL(18,2) NULL,

        -- When the payment was made or manually confirmed.
        payment_at DATETIME2(0) NULL,

        -- Internal matter id only. Do not store display number or client-facing ref here.
        matter_id NVARCHAR(120) NULL,

        -- Matter work type/practice shape for reporting.
        -- Examples: commercial, property, construction, employment.
        matter_work_type NVARCHAR(160) NULL,

        -- When the matter was opened.
        matter_at DATETIME2(0) NULL,

        -- Matter owner fields used by reporting.
        responsible_solicitor NVARCHAR(160) NULL,
        originating_solicitor NVARCHAR(160) NULL,

        -- Cached collected/recovered value for attribution reporting.
        -- Source of truth remains collected time/recovered fees.
        collected_value DECIMAL(18,2) NULL,

        -- When collected_value was last refreshed from the value source.
        collected_value_as_at DATETIME2(0) NULL,

        -- Last successful refresh of this spine row by the attribution indexer.
        recent_sync_at DATETIME2(0) NULL,

        -- Optional Data Hub note for manual correction context.
        -- Keep short. Do not store client narrative here.
        attribution_note NVARCHAR(500) NULL,

        -- Final operator lock. Null means still editable in Data Hub.
        attribution_locked_at DATETIME2(0) NULL,
        attribution_locked_by NVARCHAR(160) NULL,

        -- Who or what created this spine row.
        created_by NVARCHAR(160) NULL,

        -- When this spine row was created.
        created_at DATETIME2(0) NOT NULL
            CONSTRAINT DF_marketing_attribution_chain_created_at DEFAULT (SYSUTCDATETIME()),

        -- Who or what last updated this spine row.
        updated_by NVARCHAR(160) NULL,

        -- When this spine row was last updated.
        updated_at DATETIME2(0) NULL,

        CONSTRAINT PK_marketing_attribution_chain PRIMARY KEY (id)
    );

    PRINT 'Created dbo.marketing_attribution_chain table';
END
ELSE
    PRINT 'dbo.marketing_attribution_chain table already exists - skipped';
GO

IF OBJECT_ID(N'dbo.marketing_attribution_chain', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.marketing_attribution_chain', N'enquiry_contact_method') IS NULL
BEGIN
    ALTER TABLE dbo.marketing_attribution_chain
        ADD enquiry_contact_method NVARCHAR(80) NULL;
    PRINT 'Added dbo.marketing_attribution_chain.enquiry_contact_method';
END
GO

IF OBJECT_ID(N'dbo.marketing_attribution_chain', N'U') IS NOT NULL
   AND COL_LENGTH(N'dbo.marketing_attribution_chain', N'enquiry_area_of_work') IS NULL
BEGIN
    ALTER TABLE dbo.marketing_attribution_chain
        ADD enquiry_area_of_work NVARCHAR(160) NULL;
    PRINT 'Added dbo.marketing_attribution_chain.enquiry_area_of_work';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.marketing_attribution_chain') AND name = N'IX_marketing_attribution_chain_source')
BEGIN
    CREATE INDEX IX_marketing_attribution_chain_source
        ON dbo.marketing_attribution_chain (source_channel, source_value, enquiry_at);
    PRINT 'Created IX_marketing_attribution_chain_source';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.marketing_attribution_chain') AND name = N'IX_marketing_attribution_chain_intake')
BEGIN
    CREATE INDEX IX_marketing_attribution_chain_intake
        ON dbo.marketing_attribution_chain (intake_type, intake_at);
    PRINT 'Created IX_marketing_attribution_chain_intake';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.marketing_attribution_chain') AND name = N'IX_marketing_attribution_chain_enquiry')
BEGIN
    CREATE INDEX IX_marketing_attribution_chain_enquiry
        ON dbo.marketing_attribution_chain (enquiry_id)
        WHERE enquiry_id IS NOT NULL;
    PRINT 'Created IX_marketing_attribution_chain_enquiry';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.marketing_attribution_chain') AND name = N'IX_marketing_attribution_chain_pitch')
BEGIN
    CREATE INDEX IX_marketing_attribution_chain_pitch
        ON dbo.marketing_attribution_chain (pitch_id)
        WHERE pitch_id IS NOT NULL;
    PRINT 'Created IX_marketing_attribution_chain_pitch';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.marketing_attribution_chain') AND name = N'IX_marketing_attribution_chain_instruction')
BEGIN
    CREATE INDEX IX_marketing_attribution_chain_instruction
        ON dbo.marketing_attribution_chain (instruction_ref)
        WHERE instruction_ref IS NOT NULL;
    PRINT 'Created IX_marketing_attribution_chain_instruction';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.marketing_attribution_chain') AND name = N'IX_marketing_attribution_chain_client')
BEGIN
    CREATE INDEX IX_marketing_attribution_chain_client
        ON dbo.marketing_attribution_chain (client_id, client_type)
        WHERE client_id IS NOT NULL;
    PRINT 'Created IX_marketing_attribution_chain_client';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.marketing_attribution_chain') AND name = N'IX_marketing_attribution_chain_identity')
BEGIN
    CREATE INDEX IX_marketing_attribution_chain_identity
        ON dbo.marketing_attribution_chain (identity_check_status, identity_check_at)
        WHERE identity_check_id IS NOT NULL;
    PRINT 'Created IX_marketing_attribution_chain_identity';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.marketing_attribution_chain') AND name = N'IX_marketing_attribution_chain_risk')
BEGIN
    CREATE INDEX IX_marketing_attribution_chain_risk
        ON dbo.marketing_attribution_chain (risk_assessment_status, risk_assessment_at)
        WHERE risk_assessment_id IS NOT NULL;
    PRINT 'Created IX_marketing_attribution_chain_risk';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.marketing_attribution_chain') AND name = N'IX_marketing_attribution_chain_payment')
BEGIN
    CREATE INDEX IX_marketing_attribution_chain_payment
        ON dbo.marketing_attribution_chain (payment_status, payment_at)
        WHERE payment_id IS NOT NULL;
    PRINT 'Created IX_marketing_attribution_chain_payment';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.marketing_attribution_chain') AND name = N'IX_marketing_attribution_chain_matter')
BEGIN
    CREATE INDEX IX_marketing_attribution_chain_matter
        ON dbo.marketing_attribution_chain (matter_id, matter_work_type)
        WHERE matter_id IS NOT NULL;
    PRINT 'Created IX_marketing_attribution_chain_matter';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.marketing_attribution_chain') AND name = N'IX_marketing_attribution_chain_recent_sync')
BEGIN
    CREATE INDEX IX_marketing_attribution_chain_recent_sync
        ON dbo.marketing_attribution_chain (recent_sync_at DESC);
    PRINT 'Created IX_marketing_attribution_chain_recent_sync';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID(N'dbo.marketing_attribution_chain') AND name = N'IX_marketing_attribution_chain_locked')
BEGIN
    CREATE INDEX IX_marketing_attribution_chain_locked
        ON dbo.marketing_attribution_chain (attribution_locked_at DESC)
        WHERE attribution_locked_at IS NOT NULL;
    PRINT 'Created IX_marketing_attribution_chain_locked';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_marketing_attribution_chain_source_channel')
BEGIN
    ALTER TABLE dbo.marketing_attribution_chain
        ADD CONSTRAINT CK_marketing_attribution_chain_source_channel
        CHECK (
            source_channel IS NULL
            OR source_channel IN ('SEO', 'PPC', 'Email', 'Referral', 'Direct', 'Unknown')
        );
    PRINT 'Created CK_marketing_attribution_chain_source_channel';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_marketing_attribution_chain_intake_type')
BEGIN
    ALTER TABLE dbo.marketing_attribution_chain
        ADD CONSTRAINT CK_marketing_attribution_chain_intake_type
        CHECK (
            intake_type IS NULL
            OR intake_type IN ('call', 'form', 'email', 'manual', 'unknown')
        );
    PRINT 'Created CK_marketing_attribution_chain_intake_type';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_marketing_attribution_chain_client_type')
BEGIN
    ALTER TABLE dbo.marketing_attribution_chain
        ADD CONSTRAINT CK_marketing_attribution_chain_client_type
        CHECK (
            client_type IS NULL
            OR client_type IN ('individual', 'company', 'multiple_individuals', 'existing_client', 'unknown')
        );
    PRINT 'Created CK_marketing_attribution_chain_client_type';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_marketing_attribution_chain_identity_status')
BEGIN
    ALTER TABLE dbo.marketing_attribution_chain
        ADD CONSTRAINT CK_marketing_attribution_chain_identity_status
        CHECK (
            identity_check_status IS NULL
            OR identity_check_status IN ('pending', 'processing', 'review', 'complete')
        );
    PRINT 'Created CK_marketing_attribution_chain_identity_status';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_marketing_attribution_chain_risk_status')
BEGIN
    ALTER TABLE dbo.marketing_attribution_chain
        ADD CONSTRAINT CK_marketing_attribution_chain_risk_status
        CHECK (
            risk_assessment_status IS NULL
            OR risk_assessment_status IN ('pending', 'warning', 'review', 'complete')
        );
    PRINT 'Created CK_marketing_attribution_chain_risk_status';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_marketing_attribution_chain_payment_method')
BEGIN
    ALTER TABLE dbo.marketing_attribution_chain
        ADD CONSTRAINT CK_marketing_attribution_chain_payment_method
        CHECK (
            payment_method IS NULL
            OR payment_method IN ('card', 'bank_transfer', 'mixed', 'unknown')
        );
    PRINT 'Created CK_marketing_attribution_chain_payment_method';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = N'CK_marketing_attribution_chain_payment_status')
BEGIN
    ALTER TABLE dbo.marketing_attribution_chain
        ADD CONSTRAINT CK_marketing_attribution_chain_payment_status
        CHECK (
            payment_status IS NULL
            OR payment_status IN ('pending', 'processing', 'succeeded', 'confirmed', 'failed', 'paid')
        );
    PRINT 'Created CK_marketing_attribution_chain_payment_status';
END
GO

PRINT 'Marketing attribution chain migration complete';
GO