-- ============================================================================
-- CCL Persistence Layer — Migration Script
-- Target: Instructions DB (INSTRUCTIONS_SQL_CONNECTION_STRING)
-- Run once. Idempotent (IF NOT EXISTS guards on everything).
-- ============================================================================

-- ─── 1. CclContent — full snapshot of every CCL save/regeneration ──────────
-- Mirrors PitchContent pattern: substance + provenance + version tracking.
-- One row per save (version increments). Latest version = current draft.
IF OBJECT_ID(N'CclContent', N'U') IS NULL
BEGIN
    CREATE TABLE CclContent (
        CclContentId        INT IDENTITY(1,1) PRIMARY KEY,
        MatterId            NVARCHAR(50)    NOT NULL,
        InstructionRef      NVARCHAR(100)   NULL,

        -- Document type (future: ToB, retainer, engagement letter, etc.)
        DocumentType        NVARCHAR(50)    NOT NULL DEFAULT 'ccl',

        -- Client fields (denormalised for fast admin queries)
        ClientName          NVARCHAR(200)   NULL,
        ClientEmail         NVARCHAR(200)   NULL,
        ClientAddress       NVARCHAR(500)   NULL,

        -- Matter context
        MatterDescription   NVARCHAR(500)   NULL,
        FeeEarner           NVARCHAR(100)   NULL,
        FeeEarnerEmail      NVARCHAR(200)   NULL,
        SupervisingPartner  NVARCHAR(100)   NULL,
        PracticeArea        NVARCHAR(100)   NULL,

        -- Full field payload (all 30+ template fields as JSON)
        FieldsJson          NVARCHAR(MAX)   NOT NULL,

        -- Provenance: { fieldKey: 'ai' | 'auto' | 'user' | 'default' }
        ProvenanceJson      NVARCHAR(MAX)   NULL,

        -- Template tracking (which template version generated this)
        TemplateVersion     NVARCHAR(50)    NULL,

        -- Version tracking
        Version             INT             NOT NULL DEFAULT 1,
        Status              NVARCHAR(20)    NOT NULL DEFAULT 'draft',
            -- draft | final | uploaded | sent

        -- Upload tracking
        UploadedToClio      BIT             NOT NULL DEFAULT 0,
        UploadedToNd        BIT             NOT NULL DEFAULT 0,
        ClioDocId           NVARCHAR(100)   NULL,
        NdDocId             NVARCHAR(100)   NULL,

        -- Client delivery tracking
        SentToClient        BIT             NOT NULL DEFAULT 0,
        SentAt              DATETIME2       NULL,
        SentMethod          NVARCHAR(50)    NULL,
            -- email | clio-secure | portal | NULL

        -- Link to the AI trace that contributed to this version (nullable)
        AiTraceId           INT             NULL,

        -- Audit
        CreatedBy           NVARCHAR(50)    NULL,
        CreatedAt           DATETIME2       NOT NULL DEFAULT SYSDATETIME(),
        FinalizedAt         DATETIME2       NULL,
        FinalizedBy         NVARCHAR(50)    NULL
    );

    CREATE NONCLUSTERED INDEX IX_CclContent_MatterId
        ON CclContent (MatterId);

    CREATE NONCLUSTERED INDEX IX_CclContent_InstructionRef
        ON CclContent (InstructionRef)
        WHERE InstructionRef IS NOT NULL;

    CREATE NONCLUSTERED INDEX IX_CclContent_Status
        ON CclContent (Status, CreatedAt DESC);

    CREATE NONCLUSTERED INDEX IX_CclContent_DocumentType
        ON CclContent (DocumentType, CreatedAt DESC);

    CREATE NONCLUSTERED INDEX IX_CclContent_PracticeArea
        ON CclContent (PracticeArea, CreatedAt DESC)
        WHERE PracticeArea IS NOT NULL;

    CREATE NONCLUSTERED INDEX IX_CclContent_FeeEarner
        ON CclContent (FeeEarner)
        WHERE FeeEarner IS NOT NULL;

    PRINT 'Created CclContent table + indexes';
END
ELSE
    PRINT 'CclContent table already exists — skipped';
GO

-- ─── 2. CclAiTrace — full audit of every AI fill call ─────────────────────
-- One row per AI invocation. Stores prompts, output, context, timings.
-- This is the "show me exactly what happened" table.
IF OBJECT_ID(N'CclAiTrace', N'U') IS NULL
BEGIN
    CREATE TABLE CclAiTrace (
        CclAiTraceId        INT IDENTITY(1,1) PRIMARY KEY,
        MatterId            NVARCHAR(50)    NOT NULL,
        TrackingId          NVARCHAR(20)    NOT NULL,

        -- AI config
        AiStatus            NVARCHAR(20)    NOT NULL,
            -- complete | partial | fallback
        Model               NVARCHAR(50)    NULL,
        DurationMs          INT             NULL,
        Temperature         FLOAT           NULL,

        -- Token usage (for cost tracking & model performance)
        PromptTokens        INT             NULL,
        CompletionTokens    INT             NULL,
        TotalTokens         INT             NULL,

        -- Prompts (full text — never truncate)
        SystemPrompt        NVARCHAR(MAX)   NULL,
        UserPrompt          NVARCHAR(MAX)   NULL,
        UserPromptLength    INT             NULL,

        -- AI output
        AiOutputJson        NVARCHAR(MAX)   NULL,
        GeneratedFieldCount INT             NULL,
        Confidence          NVARCHAR(20)    NULL,
            -- full | partial | fallback

        -- Context fed to the prompt
        DataSourcesJson     NVARCHAR(MAX)   NULL,
        ContextFieldsJson   NVARCHAR(MAX)   NULL,
        ContextSnippetsJson NVARCHAR(MAX)   NULL,

        -- Error info (for fallbacks)
        FallbackReason      NVARCHAR(500)   NULL,
        ErrorMessage        NVARCHAR(500)   NULL,

        -- Retry tracking
        RetryCount          INT             NOT NULL DEFAULT 0,

        -- Audit
        CreatedBy           NVARCHAR(50)    NULL,
        CreatedAt           DATETIME2       NOT NULL DEFAULT SYSDATETIME()
    );

    CREATE NONCLUSTERED INDEX IX_CclAiTrace_MatterId
        ON CclAiTrace (MatterId, CreatedAt DESC);

    CREATE NONCLUSTERED INDEX IX_CclAiTrace_TrackingId
        ON CclAiTrace (TrackingId);

    CREATE NONCLUSTERED INDEX IX_CclAiTrace_AiStatus
        ON CclAiTrace (AiStatus, CreatedAt DESC);

    CREATE NONCLUSTERED INDEX IX_CclAiTrace_Model
        ON CclAiTrace (Model, CreatedAt DESC)
        WHERE Model IS NOT NULL;

    PRINT 'Created CclAiTrace table + indexes';
END
ELSE
    PRINT 'CclAiTrace table already exists — skipped';
GO

-- ─── 3. CclFeedback — REMOVED (superseded by CclAssessment) ──────────────
-- Table dropped via tools/db/drop-ccl-feedback.sql
-- All quality tracking now uses CclAssessment table (see migrate-ccl-assessment.sql)

PRINT '── CCL Persistence migration complete ──';
