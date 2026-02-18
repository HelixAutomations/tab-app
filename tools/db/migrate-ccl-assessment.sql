-- ============================================================================
-- CCL Assessment Layer — Quality review table for prompt engineering feedback loop
-- Target: Instructions DB (INSTRUCTIONS_SQL_CONNECTION_STRING)
-- Run once. Idempotent (IF NOT EXISTS guards).
--
-- This powers the self-improving CCL pipeline:
--   generate → save → assess → learn → improve prompts → generate better
-- ============================================================================

IF OBJECT_ID(N'CclAssessment', N'U') IS NULL
BEGIN
    CREATE TABLE CclAssessment (
        CclAssessmentId     INT IDENTITY(1,1) PRIMARY KEY,

        -- What is being assessed
        MatterId            NVARCHAR(50)    NOT NULL,
        CclContentId        INT             NULL,       -- FK to CclContent (the version assessed)
        CclAiTraceId        INT             NULL,       -- FK to CclAiTrace (the AI call assessed)
        InstructionRef      NVARCHAR(100)   NULL,

        -- Context (denormalised for fast corpus queries)
        PracticeArea        NVARCHAR(100)   NULL,
        FeeEarner           NVARCHAR(100)   NULL,
        DocumentType        NVARCHAR(50)    NOT NULL DEFAULT 'ccl',

        -- Overall quality rating
        OverallScore        INT             NOT NULL,
            -- 1 = poor, 2 = needs work, 3 = acceptable, 4 = good, 5 = excellent

        -- Structured field-level accuracy (JSON)
        -- { "costsEstimate": { "score": 3, "issue": "too_low", "note": "should include VAT" },
        --   "riskWarning": { "score": 5, "issue": null, "note": null } }
        FieldAssessmentsJson NVARCHAR(MAX)  NULL,

        -- What categories of issues were found (multi-select flags as JSON array)
        -- ["tone_wrong", "facts_wrong", "missing_context", "formatting", "legal_accuracy", "client_specific"]
        IssueCategories     NVARCHAR(500)   NULL,

        -- What was manually changed (diff summary — key fields that were edited after AI fill)
        -- { "costsEstimate": { "ai": "£500+VAT", "final": "£750+VAT" },
        --   "riskWarning": { "ai": "...", "final": "..." } }
        ManualEditsJson     NVARCHAR(MAX)   NULL,

        -- How many fields were: correct as-is, edited, replaced entirely, left empty
        FieldsCorrect       INT             NULL,
        FieldsEdited        INT             NULL,
        FieldsReplaced      INT             NULL,
        FieldsEmpty         INT             NULL,

        -- Free-text observations
        Notes               NVARCHAR(2000)  NULL,

        -- Prompt engineering recommendations (structured)
        -- e.g. "Include VAT in all cost estimates for property matters"
        PromptSuggestion    NVARCHAR(1000)  NULL,

        -- Was this assessment used to update a prompt? (closed-loop tracking)
        AppliedToPrompt     BIT             NOT NULL DEFAULT 0,
        AppliedAt           DATETIME2       NULL,
        AppliedBy           NVARCHAR(50)    NULL,

        -- Audit
        AssessedBy          NVARCHAR(50)    NOT NULL,
        CreatedAt           DATETIME2       NOT NULL DEFAULT SYSDATETIME(),
        UpdatedAt           DATETIME2       NULL
    );

    CREATE NONCLUSTERED INDEX IX_CclAssessment_MatterId
        ON CclAssessment (MatterId, CreatedAt DESC);

    CREATE NONCLUSTERED INDEX IX_CclAssessment_ContentId
        ON CclAssessment (CclContentId)
        WHERE CclContentId IS NOT NULL;

    CREATE NONCLUSTERED INDEX IX_CclAssessment_PracticeArea
        ON CclAssessment (PracticeArea, OverallScore)
        WHERE PracticeArea IS NOT NULL;

    CREATE NONCLUSTERED INDEX IX_CclAssessment_FeeEarner
        ON CclAssessment (FeeEarner, OverallScore)
        WHERE FeeEarner IS NOT NULL;

    CREATE NONCLUSTERED INDEX IX_CclAssessment_Score
        ON CclAssessment (OverallScore, CreatedAt DESC);

    CREATE NONCLUSTERED INDEX IX_CclAssessment_NotApplied
        ON CclAssessment (AppliedToPrompt, CreatedAt DESC)
        WHERE AppliedToPrompt = 0;

    PRINT 'Created CclAssessment table + indexes';
END
ELSE
    PRINT 'CclAssessment table already exists — skipped';
GO

PRINT '── CCL Assessment migration complete ──';
