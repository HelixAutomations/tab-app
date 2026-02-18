-- ═══════════════════════════════════════════════════════════════════════════════
-- Comprehensive demo pipeline seed
-- Seeds ALL tables that the pipeline lookup and CCL AI fill touch.
-- Matches the 3 demo cases visible when demo mode is enabled via the user bubble.
--
-- TWO databases need seeding:
--   Part A: Instructions DB — run against instructions.database.windows.net/instructions
--   Part B: Core Data DB    — run against helix-database-server.database.windows.net/helix-core-data
--
-- Demo cases:
--   Case 1 (DEMO-ENQ-0001) — early stage enquiry. Instruction + Deal only.
--   Case 2 (DEMO-ENQ-0002) — mid-pipeline. Instruction + Deal + EID (Refer) + Document.
--   Case 3 (DEMO-ENQ-0003) — fully complete. All tables populated. Links to Clio matter 3311402 (HELIX01-01).
--
-- ProspectIds (matching demo enquiry IDs used client-side):
--   Case 1: 90001   Case 2: 90002   Case 3: 99999
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═════════════════════════════════════════════════════════════════════════════
-- PART A: INSTRUCTIONS DB (instructions.database.windows.net/instructions)
-- ═════════════════════════════════════════════════════════════════════════════

PRINT '══ PART A: Instructions DB seed ══';

-- ─── A1. Instructions ────────────────────────────────────────────────────────

-- Case 1: Early stage — enquiry only
IF NOT EXISTS (SELECT 1 FROM Instructions WHERE InstructionRef = 'HLX-DEMO-00001')
BEGIN
    INSERT INTO Instructions (
        InstructionRef, Stage, ClientType, HelixContact,
        FirstName, LastName, Title, Gender,
        Phone, Email, CompanyName,
        Notes, ConsentGiven, InternalStatus
    ) VALUES (
        'HLX-DEMO-00001',
        'enquiry',
        'Individual',
        'LZ',
        'Demo', 'Client',
        'Mr', 'Male',
        '07700 900123', 'demo.client@helix-law.com',
        'Demo Corp',
        'Initial enquiry — client seeking advice on a contract dispute with their supplier. They have been invoiced for goods they did not receive. Supplier threatening legal action within 14 days. Client wants to understand options before committing.',
        1,
        'pending'
    );
    PRINT 'Inserted Instruction: HLX-DEMO-00001 (Case 1 — early stage)';
END
ELSE PRINT 'Instruction HLX-DEMO-00001 already exists — skipped';

-- Case 2: Mid-pipeline — proof-of-id stage, EID needs review
IF NOT EXISTS (SELECT 1 FROM Instructions WHERE InstructionRef = 'HLX-DEMO-0002-00001')
BEGIN
    INSERT INTO Instructions (
        InstructionRef, Stage, ClientType, HelixContact,
        FirstName, LastName, Title, Gender,
        Phone, Email, CompanyName,
        Notes, ConsentGiven, InternalStatus
    ) VALUES (
        'HLX-DEMO-0002-00001',
        'proof-of-id',
        'Individual',
        'LZ',
        'Demo', 'Client',
        'Mr', 'Male',
        '07700 900123', 'demo.client@helix-law.com',
        'Demo Corp',
        'Client called regarding lease renewal for their commercial premises. Current lease expires in 6 months. Landlord has proposed a 15% rent increase which client believes is excessive. Client wants advice on negotiating terms and understanding their rights under the current lease agreement. Premises are at 42 Demo Street, Brighton BN1 1AA. Lease originally signed in 2016 with 5-year break clause (not exercised). Current rent £32,000 p.a. Landlord is a national property company.',
        1,
        'pending'
    );
    PRINT 'Inserted Instruction: HLX-DEMO-0002-00001 (Case 2 — mid-pipeline)';
END
ELSE PRINT 'Instruction HLX-DEMO-0002-00001 already exists — skipped';

-- Case 3: Fully complete — matter opened, everything done
IF NOT EXISTS (SELECT 1 FROM Instructions WHERE InstructionRef = 'HELIX01-01')
BEGIN
    -- Build column list dynamically — CCLSubmitted may not exist on all environments
    DECLARE @instrCols3 nvarchar(max) = 'InstructionRef, Stage, ClientType, HelixContact, FirstName, LastName, Title, Gender, Phone, Email, CompanyName, Notes, MatterId, ConsentGiven, InternalStatus';
    DECLARE @instrVals3 nvarchar(max) = '''HELIX01-01'', ''matter-opened'', ''Company'', ''LZ'', ''Luke'', ''Demo-Client'', ''Mr'', ''Male'', ''0345 314 2044'', ''info@helix-law.com'', ''Helix administration'', ''Demo matter for CCL pipeline testing. Client requires a client care letter for a commercial retainer covering ongoing advisory work including contract review, commercial negotiations, and regulatory compliance. The engagement covers both ad-hoc advice and a retained monthly arrangement. Key considerations: (1) scope must be clearly defined to avoid scope creep, (2) billing arrangement is hourly at £425/hr with monthly billing, (3) client has requested 30-day payment terms, (4) agreed estimate for initial phase is £5,000-£8,000, (5) VAT-registered client so VAT treatment is standard. Client is familiar with legal processes and expects professional but accessible language.'', ''3311402'', 1, ''paid''';

    IF COL_LENGTH('Instructions', 'CCLSubmitted') IS NOT NULL
    BEGIN
        SET @instrCols3 = @instrCols3 + ', CCLSubmitted';
        SET @instrVals3 = @instrVals3 + ', 1';
    END;

    DECLARE @instrSql3 nvarchar(max) = 'INSERT INTO Instructions (' + @instrCols3 + ') VALUES (' + @instrVals3 + ')';
    EXEC sp_executesql @instrSql3;
    PRINT 'Inserted Instruction: HELIX01-01 (Case 3 — complete)';
END
ELSE PRINT 'Instruction HELIX01-01 already exists — skipped';

-- ─── A2. Deals ───────────────────────────────────────────────────────────────

-- Case 1
IF NOT EXISTS (SELECT 1 FROM Deals WHERE InstructionRef = 'HLX-DEMO-00001')
BEGIN
    DECLARE @dealCols1 nvarchar(max) = '[InstructionRef], [Passcode], [ServiceDescription], [Amount], [Status], [PitchedBy]';
    DECLARE @dealVals1 nvarchar(max) = '''HLX-DEMO-00001'', ''10001'', ''Contract dispute — challenging supplier invoice for undelivered goods. Initial advice and pre-action correspondence.'', 1500, ''Pitched'', ''LZ''';
    IF COL_LENGTH('dbo.Deals', 'ProspectId') IS NOT NULL
    BEGIN
        SET @dealCols1 = '[InstructionRef], [ProspectId], [Passcode], [ServiceDescription], [Amount], [Status], [PitchedBy]';
        SET @dealVals1 = '''HLX-DEMO-00001'', 90001, ''10001'', ''Contract dispute — challenging supplier invoice for undelivered goods. Initial advice and pre-action correspondence.'', 1500, ''Pitched'', ''LZ''';
    END
    ELSE IF COL_LENGTH('dbo.Deals', 'prospect_id') IS NOT NULL
    BEGIN
        SET @dealCols1 = '[InstructionRef], [prospect_id], [Passcode], [ServiceDescription], [Amount], [Status], [PitchedBy]';
        SET @dealVals1 = '''HLX-DEMO-00001'', 90001, ''10001'', ''Contract dispute — challenging supplier invoice for undelivered goods. Initial advice and pre-action correspondence.'', 1500, ''Pitched'', ''LZ''';
    END;
    IF COL_LENGTH('dbo.Deals', 'AreaOfWork') IS NOT NULL BEGIN SET @dealCols1 += ', [AreaOfWork]'; SET @dealVals1 += ', ''Commercial'''; END
    ELSE IF COL_LENGTH('dbo.Deals', 'area_of_work') IS NOT NULL BEGIN SET @dealCols1 += ', [area_of_work]'; SET @dealVals1 += ', ''Commercial'''; END
    ELSE IF COL_LENGTH('dbo.Deals', 'Area_of_Work') IS NOT NULL BEGIN SET @dealCols1 += ', [Area_of_Work]'; SET @dealVals1 += ', ''Commercial'''; END;

    BEGIN TRY
        EXEC (N'INSERT INTO Deals (' + @dealCols1 + N') VALUES (' + @dealVals1 + N')');
        PRINT 'Inserted Deal: HLX-DEMO-00001 (Case 1)';
    END TRY
    BEGIN CATCH
        PRINT 'Failed Deal insert: HLX-DEMO-00001 (Case 1) — ' + ERROR_MESSAGE();
    END CATCH;
END
ELSE PRINT 'Deal HLX-DEMO-00001 already exists — skipped';

-- Case 2
IF NOT EXISTS (SELECT 1 FROM Deals WHERE InstructionRef = 'HLX-DEMO-0002-00001')
BEGIN
    DECLARE @dealCols2 nvarchar(max) = '[InstructionRef], [Passcode], [ServiceDescription], [Amount], [Status], [PitchedBy]';
    DECLARE @dealVals2 nvarchar(max) = '''HLX-DEMO-0002-00001'', ''10002'', ''Lease renewal — advising on negotiation strategy, rent review provisions, and tenant rights under current commercial lease. Premises at 42 Demo Street, Brighton.'', 3200, ''Won'', ''LZ''';
    IF COL_LENGTH('dbo.Deals', 'ProspectId') IS NOT NULL
    BEGIN
        SET @dealCols2 = '[InstructionRef], [ProspectId], [Passcode], [ServiceDescription], [Amount], [Status], [PitchedBy]';
        SET @dealVals2 = '''HLX-DEMO-0002-00001'', 90002, ''10002'', ''Lease renewal — advising on negotiation strategy, rent review provisions, and tenant rights under current commercial lease. Premises at 42 Demo Street, Brighton.'', 3200, ''Won'', ''LZ''';
    END
    ELSE IF COL_LENGTH('dbo.Deals', 'prospect_id') IS NOT NULL
    BEGIN
        SET @dealCols2 = '[InstructionRef], [prospect_id], [Passcode], [ServiceDescription], [Amount], [Status], [PitchedBy]';
        SET @dealVals2 = '''HLX-DEMO-0002-00001'', 90002, ''10002'', ''Lease renewal — advising on negotiation strategy, rent review provisions, and tenant rights under current commercial lease. Premises at 42 Demo Street, Brighton.'', 3200, ''Won'', ''LZ''';
    END;
    IF COL_LENGTH('dbo.Deals', 'AreaOfWork') IS NOT NULL BEGIN SET @dealCols2 += ', [AreaOfWork]'; SET @dealVals2 += ', ''Property'''; END
    ELSE IF COL_LENGTH('dbo.Deals', 'area_of_work') IS NOT NULL BEGIN SET @dealCols2 += ', [area_of_work]'; SET @dealVals2 += ', ''Property'''; END
    ELSE IF COL_LENGTH('dbo.Deals', 'Area_of_Work') IS NOT NULL BEGIN SET @dealCols2 += ', [Area_of_Work]'; SET @dealVals2 += ', ''Property'''; END;

    BEGIN TRY
        EXEC (N'INSERT INTO Deals (' + @dealCols2 + N') VALUES (' + @dealVals2 + N')');
        PRINT 'Inserted Deal: HLX-DEMO-0002-00001 (Case 2)';
    END TRY
    BEGIN CATCH
        PRINT 'Failed Deal insert: HLX-DEMO-0002-00001 (Case 2) — ' + ERROR_MESSAGE();
    END CATCH;
END
ELSE PRINT 'Deal HLX-DEMO-0002-00001 already exists — skipped';

-- Case 3
IF NOT EXISTS (SELECT 1 FROM Deals WHERE InstructionRef = 'HELIX01-01')
BEGIN
    DECLARE @dealCols3 nvarchar(max) = '[InstructionRef], [Passcode], [ServiceDescription], [Amount], [Status], [PitchedBy]';
    DECLARE @dealVals3 nvarchar(max) = '''HELIX01-01'', ''00000'', ''Ongoing commercial advisory retainer covering contract review, commercial negotiations, and regulatory compliance guidance. Initial phase includes review of existing supplier agreements and preparation of standard terms.'', 7500, ''Won'', ''LZ''';
    IF COL_LENGTH('dbo.Deals', 'ProspectId') IS NOT NULL
    BEGIN
        SET @dealCols3 = '[InstructionRef], [ProspectId], [Passcode], [ServiceDescription], [Amount], [Status], [PitchedBy]';
        SET @dealVals3 = '''HELIX01-01'', 99999, ''00000'', ''Ongoing commercial advisory retainer covering contract review, commercial negotiations, and regulatory compliance guidance. Initial phase includes review of existing supplier agreements and preparation of standard terms.'', 7500, ''Won'', ''LZ''';
    END
    ELSE IF COL_LENGTH('dbo.Deals', 'prospect_id') IS NOT NULL
    BEGIN
        SET @dealCols3 = '[InstructionRef], [prospect_id], [Passcode], [ServiceDescription], [Amount], [Status], [PitchedBy]';
        SET @dealVals3 = '''HELIX01-01'', 99999, ''00000'', ''Ongoing commercial advisory retainer covering contract review, commercial negotiations, and regulatory compliance guidance. Initial phase includes review of existing supplier agreements and preparation of standard terms.'', 7500, ''Won'', ''LZ''';
    END;
    IF COL_LENGTH('dbo.Deals', 'AreaOfWork') IS NOT NULL BEGIN SET @dealCols3 += ', [AreaOfWork]'; SET @dealVals3 += ', ''Commercial'''; END
    ELSE IF COL_LENGTH('dbo.Deals', 'area_of_work') IS NOT NULL BEGIN SET @dealCols3 += ', [area_of_work]'; SET @dealVals3 += ', ''Commercial'''; END
    ELSE IF COL_LENGTH('dbo.Deals', 'Area_of_Work') IS NOT NULL BEGIN SET @dealCols3 += ', [Area_of_Work]'; SET @dealVals3 += ', ''Commercial'''; END;

    BEGIN TRY
        EXEC (N'INSERT INTO Deals (' + @dealCols3 + N') VALUES (' + @dealVals3 + N')');
        PRINT 'Inserted Deal: HELIX01-01 (Case 3)';
    END TRY
    BEGIN CATCH
        PRINT 'Failed Deal insert: HELIX01-01 (Case 3) — ' + ERROR_MESSAGE();
    END CATCH;
END
ELSE PRINT 'Deal HELIX01-01 already exists — skipped';

-- ─── A3. PitchContent ────────────────────────────────────────────────────────

-- Case 1 — no pitch yet (early stage)

-- Case 2
IF NOT EXISTS (SELECT 1 FROM PitchContent WHERE InstructionRef = 'HLX-DEMO-0002-00001')
BEGIN
    DECLARE @pitchCols2 nvarchar(max) = '[InstructionRef], [EmailSubject], [EmailBody], [ServiceDescription], [Amount], [Notes]';
    DECLARE @pitchVals2 nvarchar(max) = '@InstructionRef, @EmailSubject, @EmailBody, @ServiceDescription, @Amount, @Notes';
    DECLARE @pitchDealIdCol2 sysname = CASE
        WHEN COL_LENGTH('dbo.PitchContent', 'DealId') IS NOT NULL THEN 'DealId'
        WHEN COL_LENGTH('dbo.PitchContent', 'deal_id') IS NOT NULL THEN 'deal_id'
        WHEN COL_LENGTH('dbo.PitchContent', 'DealID') IS NOT NULL THEN 'DealID'
        ELSE NULL
    END;
    DECLARE @pitchDealId2 int = NULL;
    DECLARE @dealsDealIdCol2 sysname = CASE
        WHEN COL_LENGTH('dbo.Deals', 'DealId') IS NOT NULL THEN 'DealId'
        WHEN COL_LENGTH('dbo.Deals', 'deal_id') IS NOT NULL THEN 'deal_id'
        WHEN COL_LENGTH('dbo.Deals', 'DealID') IS NOT NULL THEN 'DealID'
        ELSE NULL
    END;

    IF @pitchDealIdCol2 IS NOT NULL
    BEGIN
        IF @dealsDealIdCol2 IS NULL
        BEGIN
            PRINT 'Failed PitchContent insert: HLX-DEMO-0002-00001 (Case 2) — required DealId column exists on PitchContent but no DealId-like column found on Deals';
        END
        ELSE
        BEGIN
            DECLARE @pitchDealIdLookup2 nvarchar(max) = N'SELECT TOP 1 @outDealId = TRY_CAST(' + QUOTENAME(@dealsDealIdCol2) + N' AS int) FROM Deals WHERE InstructionRef = @instructionRef ORDER BY TRY_CAST(' + QUOTENAME(@dealsDealIdCol2) + N' AS int) DESC';
            EXEC sp_executesql @pitchDealIdLookup2, N'@instructionRef nvarchar(100), @outDealId int OUTPUT', @instructionRef = N'HLX-DEMO-0002-00001', @outDealId = @pitchDealId2 OUTPUT;
            IF @pitchDealId2 IS NULL
            BEGIN
                PRINT 'Failed PitchContent insert: HLX-DEMO-0002-00001 (Case 2) — required DealId not found in Deals';
            END
            ELSE
            BEGIN
                SET @pitchCols2 = @pitchCols2 + N', ' + QUOTENAME(@pitchDealIdCol2);
                SET @pitchVals2 = @pitchVals2 + N', @DealId';
            END
        END
    END;

    IF @pitchDealIdCol2 IS NULL OR @pitchDealId2 IS NOT NULL
    BEGIN
        BEGIN TRY
            DECLARE @pitchSql2 nvarchar(max) = N'INSERT INTO PitchContent (' + @pitchCols2 + N') VALUES (' + @pitchVals2 + N')';
            EXEC sp_executesql
                @pitchSql2,
                N'@InstructionRef nvarchar(100), @EmailSubject nvarchar(max), @EmailBody nvarchar(max), @ServiceDescription nvarchar(max), @Amount decimal(18,2), @Notes nvarchar(max), @DealId int',
                @InstructionRef = N'HLX-DEMO-0002-00001',
                @EmailSubject = N'Helix Law — Lease Renewal Advisory',
                @EmailBody = N'Dear Client,

Thank you for your call earlier today regarding the upcoming lease renewal for your premises at 42 Demo Street, Brighton.

I have reviewed the key points you raised and can confirm that we would be pleased to assist with:

1. Reviewing the current lease terms and your rights under the existing agreement
2. Advising on the proposed 15% rent increase and comparable market evidence
3. Preparing a counter-proposal to the landlord based on current market rates
4. Negotiating revised terms on your behalf if required

Our proposed fee arrangement:
- Fixed fee for initial review and advice: £1,200 (+ VAT)
- Hourly rate for ongoing negotiations: £350/hr (+ VAT)
- Estimated total cost: £2,500–£3,500 (+ VAT)

We will provide regular updates on costs and will not incur significant additional work without your prior approval.

Kind regards,
Helix Law',
                @ServiceDescription = N'Lease renewal — negotiation and advisory',
                @Amount = 3200,
                @Notes = N'Client prefers phone communication. Lease expiry in 6 months — not urgent but needs to begin soon.',
                @DealId = @pitchDealId2;
            PRINT 'Inserted PitchContent: HLX-DEMO-0002-00001 (Case 2)';
        END TRY
        BEGIN CATCH
            PRINT 'Failed PitchContent insert: HLX-DEMO-0002-00001 (Case 2) — ' + ERROR_MESSAGE();
        END CATCH;
    END
END
ELSE PRINT 'PitchContent HLX-DEMO-0002-00001 already exists — skipped';

-- Case 3
IF NOT EXISTS (SELECT 1 FROM PitchContent WHERE InstructionRef = 'HELIX01-01')
BEGIN
    DECLARE @pitchCols3 nvarchar(max) = '[InstructionRef], [EmailSubject], [EmailBody], [ServiceDescription], [Amount], [Notes]';
    DECLARE @pitchVals3 nvarchar(max) = '@InstructionRef, @EmailSubject, @EmailBody, @ServiceDescription, @Amount, @Notes';
    DECLARE @pitchDealIdCol3 sysname = CASE
        WHEN COL_LENGTH('dbo.PitchContent', 'DealId') IS NOT NULL THEN 'DealId'
        WHEN COL_LENGTH('dbo.PitchContent', 'deal_id') IS NOT NULL THEN 'deal_id'
        WHEN COL_LENGTH('dbo.PitchContent', 'DealID') IS NOT NULL THEN 'DealID'
        ELSE NULL
    END;
    DECLARE @pitchDealId3 int = NULL;
    DECLARE @dealsDealIdCol3 sysname = CASE
        WHEN COL_LENGTH('dbo.Deals', 'DealId') IS NOT NULL THEN 'DealId'
        WHEN COL_LENGTH('dbo.Deals', 'deal_id') IS NOT NULL THEN 'deal_id'
        WHEN COL_LENGTH('dbo.Deals', 'DealID') IS NOT NULL THEN 'DealID'
        ELSE NULL
    END;

    IF @pitchDealIdCol3 IS NOT NULL
    BEGIN
        IF @dealsDealIdCol3 IS NULL
        BEGIN
            PRINT 'Failed PitchContent insert: HELIX01-01 (Case 3) — required DealId column exists on PitchContent but no DealId-like column found on Deals';
        END
        ELSE
        BEGIN
            DECLARE @pitchDealIdLookup3 nvarchar(max) = N'SELECT TOP 1 @outDealId = TRY_CAST(' + QUOTENAME(@dealsDealIdCol3) + N' AS int) FROM Deals WHERE InstructionRef = @instructionRef ORDER BY TRY_CAST(' + QUOTENAME(@dealsDealIdCol3) + N' AS int) DESC';
            EXEC sp_executesql @pitchDealIdLookup3, N'@instructionRef nvarchar(100), @outDealId int OUTPUT', @instructionRef = N'HELIX01-01', @outDealId = @pitchDealId3 OUTPUT;
            IF @pitchDealId3 IS NULL
            BEGIN
                PRINT 'Failed PitchContent insert: HELIX01-01 (Case 3) — required DealId not found in Deals';
            END
            ELSE
            BEGIN
                SET @pitchCols3 = @pitchCols3 + N', ' + QUOTENAME(@pitchDealIdCol3);
                SET @pitchVals3 = @pitchVals3 + N', @DealId';
            END
        END
    END;

    IF @pitchDealIdCol3 IS NULL OR @pitchDealId3 IS NOT NULL
    BEGIN
        BEGIN TRY
            DECLARE @pitchSql3 nvarchar(max) = N'INSERT INTO PitchContent (' + @pitchCols3 + N') VALUES (' + @pitchVals3 + N')';
            EXEC sp_executesql
                @pitchSql3,
                N'@InstructionRef nvarchar(100), @EmailSubject nvarchar(max), @EmailBody nvarchar(max), @ServiceDescription nvarchar(max), @Amount decimal(18,2), @Notes nvarchar(max), @DealId int',
                @InstructionRef = N'HELIX01-01',
                @EmailSubject = N'Helix Law — Commercial Advisory Retainer Proposal',
                @EmailBody = N'Dear Luke,

Thank you for our recent conversation regarding your commercial advisory needs. I am pleased to confirm that we would be delighted to act on behalf of Helix administration.

Based on our discussion, I understand you require ongoing commercial advisory support covering:

1. Contract review and drafting — reviewing and advising on supplier agreements, service contracts, and NDAs
2. Commercial negotiations — supporting your team during key negotiations with counterparties
3. Regulatory compliance — advising on relevant regulatory requirements affecting your business operations

Our proposed fee arrangement is as follows:
- Hourly rate: £425 per hour (+ VAT)
- Monthly billing with 30-day payment terms
- Estimated initial phase cost: £5,000–£8,000 (+ VAT) covering the review of existing supplier agreements and preparation of standard terms

We pride ourselves on providing clear, pragmatic advice that is commercially focused. We will keep you regularly updated on progress and costs, and will always seek your approval before incurring significant additional work beyond the agreed scope.

I look forward to working with you.

Kind regards,
Luke Sherwin
Helix Law',
                @ServiceDescription = N'Commercial advisory retainer — contract review, negotiations, regulatory compliance',
                @Amount = 7500,
                @Notes = N'Client prefers direct communication via email. Monthly catch-up calls agreed. Initial phase to be completed within 6 weeks.',
                @DealId = @pitchDealId3;
            PRINT 'Inserted PitchContent: HELIX01-01 (Case 3)';
        END TRY
        BEGIN CATCH
            PRINT 'Failed PitchContent insert: HELIX01-01 (Case 3) — ' + ERROR_MESSAGE();
        END CATCH;
    END
END
ELSE PRINT 'PitchContent HELIX01-01 already exists — skipped';

-- ─── A4. IDVerifications ─────────────────────────────────────────────────────

-- Case 1 — no EID yet (early stage)

-- Case 2 — EID complete but result is Refer (needs review)
IF NOT EXISTS (SELECT 1 FROM IDVerifications WHERE InstructionRef = 'HLX-DEMO-0002-00001')
BEGIN
    DECLARE @idvCols2 nvarchar(max) = '[InstructionRef], [EIDStatus], [EIDOverallResult], [EIDCheckedDate], [PEPAndSanctionsCheckResult], [AddressVerificationResult]';
    DECLARE @idvVals2 nvarchar(max) = '''HLX-DEMO-0002-00001'', ''complete'', ''Refer'', DATEADD(DAY, -2, GETDATE()), ''Review'', ''Passed''';

    IF COL_LENGTH('dbo.IDVerifications', 'ClientEmail') IS NOT NULL
    BEGIN
        SET @idvCols2 += ', [ClientEmail]';
        SET @idvVals2 += ', ''demo.client@helix-law.com''';
    END
    ELSE IF COL_LENGTH('dbo.IDVerifications', 'client_email') IS NOT NULL
    BEGIN
        SET @idvCols2 += ', [client_email]';
        SET @idvVals2 += ', ''demo.client@helix-law.com''';
    END;

    BEGIN TRY
        EXEC (N'INSERT INTO IDVerifications (' + @idvCols2 + N') VALUES (' + @idvVals2 + N')');
        PRINT 'Inserted IDVerification: HLX-DEMO-0002-00001 (Case 2 — Refer)';
    END TRY
    BEGIN CATCH
        PRINT 'Failed IDVerification insert: HLX-DEMO-0002-00001 (Case 2 — Refer) — ' + ERROR_MESSAGE();
    END CATCH;
END
ELSE PRINT 'IDVerification HLX-DEMO-0002-00001 already exists — skipped';

-- Case 3 — EID complete and passed
IF NOT EXISTS (SELECT 1 FROM IDVerifications WHERE InstructionRef = 'HELIX01-01')
BEGIN
    DECLARE @idvCols3 nvarchar(max) = '[InstructionRef], [EIDStatus], [EIDOverallResult], [EIDCheckedDate], [PEPAndSanctionsCheckResult], [AddressVerificationResult]';
    DECLARE @idvVals3 nvarchar(max) = '''HELIX01-01'', ''complete'', ''Pass'', DATEADD(DAY, -5, GETDATE()), ''Passed'', ''Passed''';

    IF COL_LENGTH('dbo.IDVerifications', 'ClientEmail') IS NOT NULL
    BEGIN
        SET @idvCols3 += ', [ClientEmail]';
        SET @idvVals3 += ', ''demo.prospect@helix-law.com''';
    END
    ELSE IF COL_LENGTH('dbo.IDVerifications', 'client_email') IS NOT NULL
    BEGIN
        SET @idvCols3 += ', [client_email]';
        SET @idvVals3 += ', ''demo.prospect@helix-law.com''';
    END;

    BEGIN TRY
        EXEC (N'INSERT INTO IDVerifications (' + @idvCols3 + N') VALUES (' + @idvVals3 + N')');
        PRINT 'Inserted IDVerification: HELIX01-01 (Case 3 — Pass)';
    END TRY
    BEGIN CATCH
        PRINT 'Failed IDVerification insert: HELIX01-01 (Case 3 — Pass) — ' + ERROR_MESSAGE();
    END CATCH;
END
ELSE PRINT 'IDVerification HELIX01-01 already exists — skipped';

-- ─── A5. RiskAssessment ──────────────────────────────────────────────────────

-- Case 1 & 2 — no risk assessment yet

-- Case 3 — risk assessed, low risk
IF NOT EXISTS (SELECT 1 FROM RiskAssessment WHERE InstructionRef = 'HELIX01-01')
BEGIN
    INSERT INTO RiskAssessment (
        InstructionRef, MatterId,
        RiskAssessmentResult, RiskScore, TransactionRiskLevel,
        RiskAssessor, ComplianceDate
    ) VALUES (
        'HELIX01-01',
        '3311402',
        'Low Risk',
        12,
        'Low',
        'LZ',
        DATEADD(DAY, -4, GETDATE())
    );
    PRINT 'Inserted RiskAssessment: HELIX01-01 (Case 3 — Low Risk)';
END
ELSE PRINT 'RiskAssessment HELIX01-01 already exists — skipped';

-- ─── A6. Payments ────────────────────────────────────────────────────────────

-- Case 1 & 2 — no payment yet

-- Case 3 — payment received
IF 1 = 1
BEGIN
    DECLARE @payInstructionCol sysname = CASE
        WHEN COL_LENGTH('dbo.Payments', 'instruction_ref') IS NOT NULL THEN 'instruction_ref'
        WHEN COL_LENGTH('dbo.Payments', 'InstructionRef') IS NOT NULL THEN 'InstructionRef'
        ELSE NULL
    END;

    IF @payInstructionCol IS NULL
    BEGIN
        PRINT 'Skipped Payment seed: no instruction ref column found on Payments';
    END
    ELSE
    BEGIN
        DECLARE @payExists bit = 0;
        DECLARE @payExistsSql nvarchar(max) = N'SELECT @exists = CASE WHEN EXISTS (SELECT 1 FROM Payments WHERE ' + QUOTENAME(@payInstructionCol) + N' = ''HELIX01-01'') THEN 1 ELSE 0 END';
        EXEC sp_executesql @payExistsSql, N'@exists bit OUTPUT', @exists = @payExists OUTPUT;

        IF @payExists = 0
        BEGIN
            DECLARE @payCols nvarchar(max) = QUOTENAME(@payInstructionCol);
            DECLARE @payVals nvarchar(max) = '''HELIX01-01''';
            DECLARE @payIdCol sysname = CASE
                WHEN COL_LENGTH('dbo.Payments', 'id') IS NOT NULL THEN 'id'
                WHEN COL_LENGTH('dbo.Payments', 'ID') IS NOT NULL THEN 'ID'
                ELSE NULL
            END;
            DECLARE @nextPayId bigint = NULL;

            IF @payIdCol IS NOT NULL
            BEGIN
                DECLARE @payIdSql nvarchar(max) = N'SELECT @out = ISNULL(MAX(TRY_CAST(' + QUOTENAME(@payIdCol) + N' AS bigint)), 0) + 1 FROM Payments';
                EXEC sp_executesql @payIdSql, N'@out bigint OUTPUT', @out = @nextPayId OUTPUT;
                SET @payCols = QUOTENAME(@payIdCol) + ', ' + @payCols;
                SET @payVals = CAST(@nextPayId AS nvarchar(40)) + ', ' + @payVals;
            END;

            IF COL_LENGTH('dbo.Payments', 'payment_status') IS NOT NULL
            BEGIN
                SET @payCols = @payCols + ', [payment_status]';
                SET @payVals = @payVals + ', ''succeeded''';
            END
            ELSE IF COL_LENGTH('dbo.Payments', 'PaymentStatus') IS NOT NULL
            BEGIN
                SET @payCols = @payCols + ', [PaymentStatus]';
                SET @payVals = @payVals + ', ''succeeded''';
            END;

            IF COL_LENGTH('dbo.Payments', 'internal_status') IS NOT NULL
            BEGIN
                SET @payCols = @payCols + ', [internal_status]';
                SET @payVals = @payVals + ', ''completed''';
            END
            ELSE IF COL_LENGTH('dbo.Payments', 'InternalStatus') IS NOT NULL
            BEGIN
                SET @payCols = @payCols + ', [InternalStatus]';
                SET @payVals = @payVals + ', ''completed''';
            END;

            IF COL_LENGTH('dbo.Payments', 'amount') IS NOT NULL
            BEGIN
                SET @payCols = @payCols + ', [amount]';
                SET @payVals = @payVals + ', 750000';
            END
            ELSE IF COL_LENGTH('dbo.Payments', 'Amount') IS NOT NULL
            BEGIN
                SET @payCols = @payCols + ', [Amount]';
                SET @payVals = @payVals + ', 750000';
            END;

            IF COL_LENGTH('dbo.Payments', 'payment_id') IS NOT NULL
            BEGIN
                SET @payCols = @payCols + ', [payment_id]';
                SET @payVals = @payVals + ', ''pi_demo_helix01''';
            END
            ELSE IF COL_LENGTH('dbo.Payments', 'payment_intent_id') IS NOT NULL
            BEGIN
                SET @payCols = @payCols + ', [payment_intent_id]';
                SET @payVals = @payVals + ', ''pi_demo_helix01''';
            END
            ELSE IF COL_LENGTH('dbo.Payments', 'PaymentId') IS NOT NULL
            BEGIN
                SET @payCols = @payCols + ', [PaymentId]';
                SET @payVals = @payVals + ', ''pi_demo_helix01''';
            END;

            IF COL_LENGTH('dbo.Payments', 'created_at') IS NOT NULL
            BEGIN
                SET @payCols = @payCols + ', [created_at]';
                SET @payVals = @payVals + ', DATEADD(DAY, -3, GETDATE())';
            END
            ELSE IF COL_LENGTH('dbo.Payments', 'CreatedAt') IS NOT NULL
            BEGIN
                SET @payCols = @payCols + ', [CreatedAt]';
                SET @payVals = @payVals + ', DATEADD(DAY, -3, GETDATE())';
            END;

            BEGIN TRY
                DECLARE @payInsertSql nvarchar(max) = N'INSERT INTO Payments (' + @payCols + N') VALUES (' + @payVals + N')';
                EXEC (@payInsertSql);
                PRINT 'Inserted Payment: HELIX01-01 (Case 3 — £7,500)';
            END TRY
            BEGIN CATCH
                PRINT 'Failed Payment insert: HELIX01-01 (Case 3) — ' + ERROR_MESSAGE();
            END CATCH;
        END
        ELSE
        BEGIN
            PRINT 'Payment HELIX01-01 already exists — skipped';
        END
    END
END

-- ─── A7. Documents ───────────────────────────────────────────────────────────

-- Case 1 — no documents

-- Case 2 — 1 document (passport scan)
IF NOT EXISTS (SELECT 1 FROM Documents WHERE InstructionRef = 'HLX-DEMO-0002-00001')
BEGIN
    INSERT INTO Documents (
        InstructionRef, FileName, DocumentType,
        FileSizeBytes, UploadedAt
    ) VALUES (
        'HLX-DEMO-0002-00001',
        'Passport_Scan.pdf',
        'ID',
        245000,
        DATEADD(DAY, -2, GETDATE())
    );
    PRINT 'Inserted Document: HLX-DEMO-0002-00001 (Case 2 — Passport)';
END
ELSE PRINT 'Document HLX-DEMO-0002-00001 already exists — skipped';

-- Case 3 — 3 documents
IF NOT EXISTS (SELECT 1 FROM Documents WHERE InstructionRef = 'HELIX01-01')
BEGIN
    INSERT INTO Documents (InstructionRef, FileName, DocumentType, FileSizeBytes, UploadedAt)
    VALUES ('HELIX01-01', 'Passport_Scan.pdf', 'ID', 245000, DATEADD(DAY, -5, GETDATE()));

    INSERT INTO Documents (InstructionRef, FileName, DocumentType, FileSizeBytes, UploadedAt)
    VALUES ('HELIX01-01', 'Engagement_Letter_Signed.pdf', 'Engagement', 182000, DATEADD(DAY, -4, GETDATE()));

    INSERT INTO Documents (InstructionRef, FileName, DocumentType, FileSizeBytes, UploadedAt)
    VALUES ('HELIX01-01', 'Supplier_Agreement_Review.pdf', 'Contract', 310000, DATEADD(DAY, -3, GETDATE()));

    PRINT 'Inserted 3 Documents: HELIX01-01 (Case 3)';
END
ELSE PRINT 'Documents HELIX01-01 already exist — skipped';

-- ─── A8. Matters ─────────────────────────────────────────────────────────────

-- Case 1 & 2 — no matter opened yet

-- Case 3 — matter opened (links to real Clio matter 3311402)
IF NOT EXISTS (SELECT 1 FROM Matters WHERE InstructionRef = 'HELIX01-01')
BEGIN
    -- Build column list dynamically — CCL_date may not exist on all environments
    DECLARE @matCols3 nvarchar(max) = 'InstructionRef, MatterId, DisplayNumber, ClientName, Status, OpenDate';
    DECLARE @matVals3 nvarchar(max) = '''HELIX01-01'', ''3311402'', ''HELIX01-01'', ''Helix administration'', ''Active'', DATEADD(DAY, -3, GETDATE())';

    IF COL_LENGTH('Matters', 'CCL_date') IS NOT NULL
    BEGIN
        SET @matCols3 = @matCols3 + ', CCL_date';
        SET @matVals3 = @matVals3 + ', DATEADD(DAY, -2, GETDATE())';
    END;

    DECLARE @matSql3 nvarchar(max) = 'INSERT INTO Matters (' + @matCols3 + ') VALUES (' + @matVals3 + ')';
    EXEC sp_executesql @matSql3;
    PRINT 'Inserted Matter: HELIX01-01 → 3311402 (Case 3)';
END
ELSE PRINT 'Matter HELIX01-01 already exists — skipped';

-- ─── A9. dbo.enquiries (new-space enquiries in Instructions DB) ─────────────
-- The pipeline lookup maps legacy ProspectIds to new enquiry IDs via the acid column.
-- We insert new-space mirror rows so TeamsBotActivityTracking joins work.

-- Case 1
IF NOT EXISTS (SELECT 1 FROM [dbo].[enquiries] WHERE acid = '90001')
BEGIN
    DECLARE @enqCols1 nvarchar(max) = '[acid]';
    DECLARE @enqVals1 nvarchar(max) = '''90001''';

    IF COL_LENGTH('dbo.enquiries', 'notes') IS NOT NULL
    BEGIN
        SET @enqCols1 = @enqCols1 + ', [notes]';
        SET @enqVals1 = @enqVals1 + ', ''Contract dispute enquiry — demo pipeline case 1''';
    END
    ELSE IF COL_LENGTH('dbo.enquiries', 'Notes') IS NOT NULL
    BEGIN
        SET @enqCols1 = @enqCols1 + ', [Notes]';
        SET @enqVals1 = @enqVals1 + ', ''Contract dispute enquiry — demo pipeline case 1''';
    END;

    IF COL_LENGTH('dbo.enquiries', 'datetime') IS NOT NULL
    BEGIN
        SET @enqCols1 = @enqCols1 + ', [datetime]';
        SET @enqVals1 = @enqVals1 + ', GETDATE()';
    END
    ELSE IF COL_LENGTH('dbo.enquiries', 'DateTime') IS NOT NULL
    BEGIN
        SET @enqCols1 = @enqCols1 + ', [DateTime]';
        SET @enqVals1 = @enqVals1 + ', GETDATE()';
    END
    ELSE IF COL_LENGTH('dbo.enquiries', 'date_created') IS NOT NULL
    BEGIN
        SET @enqCols1 = @enqCols1 + ', [date_created]';
        SET @enqVals1 = @enqVals1 + ', GETDATE()';
    END
    ELSE IF COL_LENGTH('dbo.enquiries', 'Date_Created') IS NOT NULL
    BEGIN
        SET @enqCols1 = @enqCols1 + ', [Date_Created]';
        SET @enqVals1 = @enqVals1 + ', GETDATE()';
    END;

    IF COL_LENGTH('dbo.enquiries', 'email') IS NOT NULL
    BEGIN
        SET @enqCols1 = @enqCols1 + ', [email]';
        SET @enqVals1 = @enqVals1 + ', ''demo.client@helix-law.com''';
    END
    ELSE IF COL_LENGTH('dbo.enquiries', 'Email') IS NOT NULL
    BEGIN
        SET @enqCols1 = @enqCols1 + ', [Email]';
        SET @enqVals1 = @enqVals1 + ', ''demo.client@helix-law.com''';
    END;

    DECLARE @enqSql1 nvarchar(max) = N'INSERT INTO [dbo].[enquiries] (' + @enqCols1 + N') VALUES (' + @enqVals1 + N')';
    EXEC (@enqSql1);
    PRINT 'Inserted new-space enquiry: acid=90001 (Case 1)';
END
ELSE PRINT 'New-space enquiry acid=90001 already exists — skipped';

-- Case 2
IF NOT EXISTS (SELECT 1 FROM [dbo].[enquiries] WHERE acid = '90002')
BEGIN
    DECLARE @enqCols2 nvarchar(max) = '[acid]';
    DECLARE @enqVals2 nvarchar(max) = '''90002''';

    IF COL_LENGTH('dbo.enquiries', 'notes') IS NOT NULL
    BEGIN
        SET @enqCols2 = @enqCols2 + ', [notes]';
        SET @enqVals2 = @enqVals2 + ', ''Lease renewal enquiry — demo pipeline case 2''';
    END
    ELSE IF COL_LENGTH('dbo.enquiries', 'Notes') IS NOT NULL
    BEGIN
        SET @enqCols2 = @enqCols2 + ', [Notes]';
        SET @enqVals2 = @enqVals2 + ', ''Lease renewal enquiry — demo pipeline case 2''';
    END;

    IF COL_LENGTH('dbo.enquiries', 'datetime') IS NOT NULL
    BEGIN
        SET @enqCols2 = @enqCols2 + ', [datetime]';
        SET @enqVals2 = @enqVals2 + ', DATEADD(DAY, -5, GETDATE())';
    END
    ELSE IF COL_LENGTH('dbo.enquiries', 'DateTime') IS NOT NULL
    BEGIN
        SET @enqCols2 = @enqCols2 + ', [DateTime]';
        SET @enqVals2 = @enqVals2 + ', DATEADD(DAY, -5, GETDATE())';
    END
    ELSE IF COL_LENGTH('dbo.enquiries', 'date_created') IS NOT NULL
    BEGIN
        SET @enqCols2 = @enqCols2 + ', [date_created]';
        SET @enqVals2 = @enqVals2 + ', DATEADD(DAY, -5, GETDATE())';
    END
    ELSE IF COL_LENGTH('dbo.enquiries', 'Date_Created') IS NOT NULL
    BEGIN
        SET @enqCols2 = @enqCols2 + ', [Date_Created]';
        SET @enqVals2 = @enqVals2 + ', DATEADD(DAY, -5, GETDATE())';
    END;

    IF COL_LENGTH('dbo.enquiries', 'email') IS NOT NULL
    BEGIN
        SET @enqCols2 = @enqCols2 + ', [email]';
        SET @enqVals2 = @enqVals2 + ', ''demo.client@helix-law.com''';
    END
    ELSE IF COL_LENGTH('dbo.enquiries', 'Email') IS NOT NULL
    BEGIN
        SET @enqCols2 = @enqCols2 + ', [Email]';
        SET @enqVals2 = @enqVals2 + ', ''demo.client@helix-law.com''';
    END;

    DECLARE @enqSql2 nvarchar(max) = N'INSERT INTO [dbo].[enquiries] (' + @enqCols2 + N') VALUES (' + @enqVals2 + N')';
    EXEC (@enqSql2);
    PRINT 'Inserted new-space enquiry: acid=90002 (Case 2)';
END
ELSE PRINT 'New-space enquiry acid=90002 already exists — skipped';

-- Case 3
IF NOT EXISTS (SELECT 1 FROM [dbo].[enquiries] WHERE acid = '99999')
BEGIN
    DECLARE @enqCols3 nvarchar(max) = '[acid]';
    DECLARE @enqVals3 nvarchar(max) = '''99999''';

    IF COL_LENGTH('dbo.enquiries', 'notes') IS NOT NULL
    BEGIN
        SET @enqCols3 = @enqCols3 + ', [notes]';
        SET @enqVals3 = @enqVals3 + ', ''Commercial advisory retainer — demo pipeline case 3 (complete)''';
    END
    ELSE IF COL_LENGTH('dbo.enquiries', 'Notes') IS NOT NULL
    BEGIN
        SET @enqCols3 = @enqCols3 + ', [Notes]';
        SET @enqVals3 = @enqVals3 + ', ''Commercial advisory retainer — demo pipeline case 3 (complete)''';
    END;

    IF COL_LENGTH('dbo.enquiries', 'datetime') IS NOT NULL
    BEGIN
        SET @enqCols3 = @enqCols3 + ', [datetime]';
        SET @enqVals3 = @enqVals3 + ', DATEADD(DAY, -7, GETDATE())';
    END
    ELSE IF COL_LENGTH('dbo.enquiries', 'DateTime') IS NOT NULL
    BEGIN
        SET @enqCols3 = @enqCols3 + ', [DateTime]';
        SET @enqVals3 = @enqVals3 + ', DATEADD(DAY, -7, GETDATE())';
    END
    ELSE IF COL_LENGTH('dbo.enquiries', 'date_created') IS NOT NULL
    BEGIN
        SET @enqCols3 = @enqCols3 + ', [date_created]';
        SET @enqVals3 = @enqVals3 + ', DATEADD(DAY, -7, GETDATE())';
    END
    ELSE IF COL_LENGTH('dbo.enquiries', 'Date_Created') IS NOT NULL
    BEGIN
        SET @enqCols3 = @enqCols3 + ', [Date_Created]';
        SET @enqVals3 = @enqVals3 + ', DATEADD(DAY, -7, GETDATE())';
    END;

    IF COL_LENGTH('dbo.enquiries', 'email') IS NOT NULL
    BEGIN
        SET @enqCols3 = @enqCols3 + ', [email]';
        SET @enqVals3 = @enqVals3 + ', ''demo.prospect@helix-law.com''';
    END
    ELSE IF COL_LENGTH('dbo.enquiries', 'Email') IS NOT NULL
    BEGIN
        SET @enqCols3 = @enqCols3 + ', [Email]';
        SET @enqVals3 = @enqVals3 + ', ''demo.prospect@helix-law.com''';
    END;

    DECLARE @enqSql3 nvarchar(max) = N'INSERT INTO [dbo].[enquiries] (' + @enqCols3 + N') VALUES (' + @enqVals3 + N')';
    EXEC (@enqSql3);
    PRINT 'Inserted new-space enquiry: acid=99999 (Case 3)';
END
ELSE PRINT 'New-space enquiry acid=99999 already exists — skipped';

PRINT '══ Instructions DB seed complete ══';
PRINT '';
PRINT '██████████████████████████████████████████████████████████████████████████████';
PRINT '██  STOP HERE. Part A is done.                                            ██';
PRINT '██  Switch connection to CORE DATA DB before running Part B below.        ██';
PRINT '██  helix-database-server.database.windows.net / helix-core-data          ██';
PRINT '██████████████████████████████████████████████████████████████████████████████';

-- ═════════════════════════════════════════════════════════════════════════════
-- PART B: CORE DATA DB (helix-database-server.database.windows.net/helix-core-data)
-- ═════════════════════════════════════════════════════════════════════════════
-- *** RUN THIS PART AGAINST A DIFFERENT DATABASE — helix-core-data ***
-- *** Do NOT run against the Instructions DB — column names differ ***
--
-- Legacy enquiries table — the CCL AI pipeline resolves Deal.ProspectId → enquiries.ID
-- to get initial call notes, area of work, and other rich context text.
--
-- NOTE: enquiries.ID is an IDENTITY column. To insert specific IDs:
--   SET IDENTITY_INSERT enquiries ON / OFF
-- If IDENTITY_INSERT is not allowed on your connection, the rows will get
-- auto-assigned IDs and you'll need to update Deal.ProspectId to match.

PRINT '══ PART B: Core Data DB seed ══';

-- Case 1 (ProspectId=90001)
IF NOT EXISTS (SELECT 1 FROM enquiries WHERE ID = 90001)
BEGIN
    DECLARE @coreCols1 nvarchar(max) = '[ID]';
    DECLARE @coreVals1 nvarchar(max) = '90001';

    IF COL_LENGTH('dbo.enquiries', 'First_Name') IS NOT NULL BEGIN SET @coreCols1 += ',[First_Name]'; SET @coreVals1 += ',''Demo'''; END
    ELSE IF COL_LENGTH('dbo.enquiries', 'first_name') IS NOT NULL BEGIN SET @coreCols1 += ',[first_name]'; SET @coreVals1 += ',''Demo'''; END

    IF COL_LENGTH('dbo.enquiries', 'Last_Name') IS NOT NULL BEGIN SET @coreCols1 += ',[Last_Name]'; SET @coreVals1 += ',''Client'''; END
    ELSE IF COL_LENGTH('dbo.enquiries', 'last_name') IS NOT NULL BEGIN SET @coreCols1 += ',[last_name]'; SET @coreVals1 += ',''Client'''; END

    IF COL_LENGTH('dbo.enquiries', 'Email') IS NOT NULL BEGIN SET @coreCols1 += ',[Email]'; SET @coreVals1 += ',''demo.client@helix-law.com'''; END
    ELSE IF COL_LENGTH('dbo.enquiries', 'email') IS NOT NULL BEGIN SET @coreCols1 += ',[email]'; SET @coreVals1 += ',''demo.client@helix-law.com'''; END

    IF COL_LENGTH('dbo.enquiries', 'Phone_Number') IS NOT NULL BEGIN SET @coreCols1 += ',[Phone_Number]'; SET @coreVals1 += ',''07700 900123'''; END
    ELSE IF COL_LENGTH('dbo.enquiries', 'phone') IS NOT NULL BEGIN SET @coreCols1 += ',[phone]'; SET @coreVals1 += ',''07700 900123'''; END

    IF COL_LENGTH('dbo.enquiries', 'Area_of_Work') IS NOT NULL BEGIN SET @coreCols1 += ',[Area_of_Work]'; SET @coreVals1 += ',''Commercial'''; END
    IF COL_LENGTH('dbo.enquiries', 'Point_of_Contact') IS NOT NULL BEGIN SET @coreCols1 += ',[Point_of_Contact]'; SET @coreVals1 += ',''LZ'''; END
    IF COL_LENGTH('dbo.enquiries', 'Method_of_Contact') IS NOT NULL BEGIN SET @coreCols1 += ',[Method_of_Contact]'; SET @coreVals1 += ',''Email'''; END
    IF COL_LENGTH('dbo.enquiries', 'Date_Created') IS NOT NULL BEGIN SET @coreCols1 += ',[Date_Created]'; SET @coreVals1 += ',GETDATE()'; END
    ELSE IF COL_LENGTH('dbo.enquiries', 'date_created') IS NOT NULL BEGIN SET @coreCols1 += ',[date_created]'; SET @coreVals1 += ',GETDATE()'; END
    IF COL_LENGTH('dbo.enquiries', 'datetime') IS NOT NULL BEGIN SET @coreCols1 += ',[datetime]'; SET @coreVals1 += ',GETDATE()'; END
    ELSE IF COL_LENGTH('dbo.enquiries', 'DateTime') IS NOT NULL BEGIN SET @coreCols1 += ',[DateTime]'; SET @coreVals1 += ',GETDATE()'; END

    IF COL_LENGTH('dbo.enquiries', 'Initial_first_call_notes') IS NOT NULL BEGIN
        SET @coreCols1 += ',[Initial_first_call_notes]';
        SET @coreVals1 += ',''Client enquiring about a contract dispute with their supplier. They have been invoiced for £12,000 for goods they did not receive — specifically a bulk order of office equipment that was confirmed as dispatched but never arrived. The supplier (ABC Supplies Ltd) is now threatening legal action within 14 days if payment is not made. Client has email trail showing order confirmation, delivery tracking that shows "returned to sender", and their own goods-in log confirming nothing was received. Client has attempted to resolve directly with supplier but got no response for 2 weeks. Client wants advice on: (1) whether they have grounds to challenge the invoice, (2) what their options are if the supplier issues proceedings, (3) whether they can counter-claim for the inconvenience and cost of sourcing alternative supplies. Budget is flexible but hoping for a fixed fee for initial advice.''';
    END
    ELSE IF COL_LENGTH('dbo.enquiries', 'notes') IS NOT NULL BEGIN
        SET @coreCols1 += ',[notes]';
        SET @coreVals1 += ',''Contract dispute enquiry with urgent 14-day response deadline.''';
    END;

    IF COL_LENGTH('dbo.enquiries', 'Value') IS NOT NULL BEGIN SET @coreCols1 += ',[Value]'; SET @coreVals1 += ',1500'; END
    IF COL_LENGTH('dbo.enquiries', 'Tags') IS NOT NULL BEGIN SET @coreCols1 += ',[Tags]'; SET @coreVals1 += ',''Demo, Contract Dispute'''; END

    IF COL_LENGTH('dbo.enquiries', 'ID') IS NOT NULL
    BEGIN
        BEGIN TRY SET IDENTITY_INSERT enquiries ON; END TRY BEGIN CATCH END CATCH;
        EXEC (N'INSERT INTO enquiries (' + @coreCols1 + N') VALUES (' + @coreVals1 + N')');
        BEGIN TRY SET IDENTITY_INSERT enquiries OFF; END TRY BEGIN CATCH END CATCH;
    END
    PRINT 'Inserted legacy enquiry: ID 90001 (Case 1 — Contract Dispute)';
END
ELSE PRINT 'Enquiry ID 90001 already exists — skipped';

-- Case 2 (ProspectId=90002)
IF NOT EXISTS (SELECT 1 FROM enquiries WHERE ID = 90002)
BEGIN
    DECLARE @coreCols2 nvarchar(max) = '[ID]';
    DECLARE @coreVals2 nvarchar(max) = '90002';

    IF COL_LENGTH('dbo.enquiries', 'First_Name') IS NOT NULL BEGIN SET @coreCols2 += ',[First_Name]'; SET @coreVals2 += ',''Demo'''; END
    ELSE IF COL_LENGTH('dbo.enquiries', 'first_name') IS NOT NULL BEGIN SET @coreCols2 += ',[first_name]'; SET @coreVals2 += ',''Demo'''; END
    IF COL_LENGTH('dbo.enquiries', 'Last_Name') IS NOT NULL BEGIN SET @coreCols2 += ',[Last_Name]'; SET @coreVals2 += ',''Client'''; END
    ELSE IF COL_LENGTH('dbo.enquiries', 'last_name') IS NOT NULL BEGIN SET @coreCols2 += ',[last_name]'; SET @coreVals2 += ',''Client'''; END
    IF COL_LENGTH('dbo.enquiries', 'Email') IS NOT NULL BEGIN SET @coreCols2 += ',[Email]'; SET @coreVals2 += ',''demo.client@helix-law.com'''; END
    ELSE IF COL_LENGTH('dbo.enquiries', 'email') IS NOT NULL BEGIN SET @coreCols2 += ',[email]'; SET @coreVals2 += ',''demo.client@helix-law.com'''; END
    IF COL_LENGTH('dbo.enquiries', 'Phone_Number') IS NOT NULL BEGIN SET @coreCols2 += ',[Phone_Number]'; SET @coreVals2 += ',''07700 900123'''; END
    ELSE IF COL_LENGTH('dbo.enquiries', 'phone') IS NOT NULL BEGIN SET @coreCols2 += ',[phone]'; SET @coreVals2 += ',''07700 900123'''; END
    IF COL_LENGTH('dbo.enquiries', 'Area_of_Work') IS NOT NULL BEGIN SET @coreCols2 += ',[Area_of_Work]'; SET @coreVals2 += ',''Property'''; END
    IF COL_LENGTH('dbo.enquiries', 'Point_of_Contact') IS NOT NULL BEGIN SET @coreCols2 += ',[Point_of_Contact]'; SET @coreVals2 += ',''LZ'''; END
    IF COL_LENGTH('dbo.enquiries', 'Method_of_Contact') IS NOT NULL BEGIN SET @coreCols2 += ',[Method_of_Contact]'; SET @coreVals2 += ',''Phone'''; END
    IF COL_LENGTH('dbo.enquiries', 'Date_Created') IS NOT NULL BEGIN SET @coreCols2 += ',[Date_Created]'; SET @coreVals2 += ',DATEADD(DAY, -5, GETDATE())'; END
    ELSE IF COL_LENGTH('dbo.enquiries', 'date_created') IS NOT NULL BEGIN SET @coreCols2 += ',[date_created]'; SET @coreVals2 += ',DATEADD(DAY, -5, GETDATE())'; END
    IF COL_LENGTH('dbo.enquiries', 'datetime') IS NOT NULL BEGIN SET @coreCols2 += ',[datetime]'; SET @coreVals2 += ',DATEADD(DAY, -5, GETDATE())'; END
    ELSE IF COL_LENGTH('dbo.enquiries', 'DateTime') IS NOT NULL BEGIN SET @coreCols2 += ',[DateTime]'; SET @coreVals2 += ',DATEADD(DAY, -5, GETDATE())'; END

    IF COL_LENGTH('dbo.enquiries', 'Initial_first_call_notes') IS NOT NULL BEGIN
        SET @coreCols2 += ',[Initial_first_call_notes]';
        SET @coreVals2 += ',''Client called regarding lease renewal for their commercial premises at 42 Demo Street, Brighton BN1 1AA. Current lease expires in 6 months (originally a 10-year lease signed in 2016 with a 5-year break clause that was not exercised). Current rent is £32,000 per annum. Landlord (National Property Holdings PLC) has proposed a 15% rent increase to £36,800 p.a. Client believes this is excessive given current market conditions — comparable units in the area are letting at £28-£30 per sq ft and their premises are 1,100 sq ft. Client wants: (1) advice on their rights under the current lease, (2) comparable market evidence to challenge the increase, (3) a negotiation strategy, and (4) if needed, representation in any formal rent review process.''';
    END
    ELSE IF COL_LENGTH('dbo.enquiries', 'notes') IS NOT NULL BEGIN
        SET @coreCols2 += ',[notes]';
        SET @coreVals2 += ',''Lease renewal enquiry with rent-review negotiation context.''';
    END;

    IF COL_LENGTH('dbo.enquiries', 'Value') IS NOT NULL BEGIN SET @coreCols2 += ',[Value]'; SET @coreVals2 += ',3200'; END
    IF COL_LENGTH('dbo.enquiries', 'Tags') IS NOT NULL BEGIN SET @coreCols2 += ',[Tags]'; SET @coreVals2 += ',''Demo, Lease Renewal'''; END

    BEGIN TRY SET IDENTITY_INSERT enquiries ON; END TRY BEGIN CATCH END CATCH;
    EXEC (N'INSERT INTO enquiries (' + @coreCols2 + N') VALUES (' + @coreVals2 + N')');
    BEGIN TRY SET IDENTITY_INSERT enquiries OFF; END TRY BEGIN CATCH END CATCH;
    PRINT 'Inserted legacy enquiry: ID 90002 (Case 2 — Lease Renewal)';
END
ELSE PRINT 'Enquiry ID 90002 already exists — skipped';

-- Case 3 (ProspectId=99999)
IF NOT EXISTS (SELECT 1 FROM enquiries WHERE ID = 99999)
BEGIN
    DECLARE @coreCols3 nvarchar(max) = '[ID]';
    DECLARE @coreVals3 nvarchar(max) = '99999';

    IF COL_LENGTH('dbo.enquiries', 'First_Name') IS NOT NULL BEGIN SET @coreCols3 += ',[First_Name]'; SET @coreVals3 += ',''Demo'''; END
    ELSE IF COL_LENGTH('dbo.enquiries', 'first_name') IS NOT NULL BEGIN SET @coreCols3 += ',[first_name]'; SET @coreVals3 += ',''Demo'''; END
    IF COL_LENGTH('dbo.enquiries', 'Last_Name') IS NOT NULL BEGIN SET @coreCols3 += ',[Last_Name]'; SET @coreVals3 += ',''Prospect'''; END
    ELSE IF COL_LENGTH('dbo.enquiries', 'last_name') IS NOT NULL BEGIN SET @coreCols3 += ',[last_name]'; SET @coreVals3 += ',''Prospect'''; END
    IF COL_LENGTH('dbo.enquiries', 'Email') IS NOT NULL BEGIN SET @coreCols3 += ',[Email]'; SET @coreVals3 += ',''demo.prospect@helix-law.com'''; END
    ELSE IF COL_LENGTH('dbo.enquiries', 'email') IS NOT NULL BEGIN SET @coreCols3 += ',[email]'; SET @coreVals3 += ',''demo.prospect@helix-law.com'''; END
    IF COL_LENGTH('dbo.enquiries', 'Phone_Number') IS NOT NULL BEGIN SET @coreCols3 += ',[Phone_Number]'; SET @coreVals3 += ',''07000000000'''; END
    ELSE IF COL_LENGTH('dbo.enquiries', 'phone') IS NOT NULL BEGIN SET @coreCols3 += ',[phone]'; SET @coreVals3 += ',''07000000000'''; END
    IF COL_LENGTH('dbo.enquiries', 'Area_of_Work') IS NOT NULL BEGIN SET @coreCols3 += ',[Area_of_Work]'; SET @coreVals3 += ',''Commercial'''; END
    IF COL_LENGTH('dbo.enquiries', 'Point_of_Contact') IS NOT NULL BEGIN SET @coreCols3 += ',[Point_of_Contact]'; SET @coreVals3 += ',''LZ'''; END
    IF COL_LENGTH('dbo.enquiries', 'Method_of_Contact') IS NOT NULL BEGIN SET @coreCols3 += ',[Method_of_Contact]'; SET @coreVals3 += ',''Email'''; END
    IF COL_LENGTH('dbo.enquiries', 'Date_Created') IS NOT NULL BEGIN SET @coreCols3 += ',[Date_Created]'; SET @coreVals3 += ',DATEADD(DAY, -7, GETDATE())'; END
    ELSE IF COL_LENGTH('dbo.enquiries', 'date_created') IS NOT NULL BEGIN SET @coreCols3 += ',[date_created]'; SET @coreVals3 += ',DATEADD(DAY, -7, GETDATE())'; END
    IF COL_LENGTH('dbo.enquiries', 'datetime') IS NOT NULL BEGIN SET @coreCols3 += ',[datetime]'; SET @coreVals3 += ',DATEADD(DAY, -7, GETDATE())'; END
    ELSE IF COL_LENGTH('dbo.enquiries', 'DateTime') IS NOT NULL BEGIN SET @coreCols3 += ',[DateTime]'; SET @coreVals3 += ',DATEADD(DAY, -7, GETDATE())'; END

    IF COL_LENGTH('dbo.enquiries', 'Initial_first_call_notes') IS NOT NULL BEGIN
        SET @coreCols3 += ',[Initial_first_call_notes]';
        SET @coreVals3 += ',''Initial call with Demo Prospect from Helix administration regarding ongoing commercial advisory needs. Client operates a legal technology company and requires support across three key areas: (1) review of existing supplier contracts — currently has 12 active vendor agreements, several of which are due for renewal in Q2 2026, (2) commercial negotiation support for a potential partnership agreement with a US-based software provider, and (3) regulatory compliance advice relating to data protection obligations under UK GDPR as they expand their client base. Client mentioned previous experience with solicitors and expects responsive, commercially pragmatic advice. Discussed hourly billing at £425/hr with monthly invoicing. Client confirmed budget of £5,000-£8,000 for initial phase.''';
    END
    ELSE IF COL_LENGTH('dbo.enquiries', 'notes') IS NOT NULL BEGIN
        SET @coreCols3 += ',[notes]';
        SET @coreVals3 += ',''Commercial advisory retainer enquiry (demo complete case).''';
    END;

    IF COL_LENGTH('dbo.enquiries', 'Value') IS NOT NULL BEGIN SET @coreCols3 += ',[Value]'; SET @coreVals3 += ',7500'; END
    IF COL_LENGTH('dbo.enquiries', 'Tags') IS NOT NULL BEGIN SET @coreCols3 += ',[Tags]'; SET @coreVals3 += ',''Demo, Commercial Retainer'''; END

    BEGIN TRY SET IDENTITY_INSERT enquiries ON; END TRY BEGIN CATCH END CATCH;
    EXEC (N'INSERT INTO enquiries (' + @coreCols3 + N') VALUES (' + @coreVals3 + N')');
    BEGIN TRY SET IDENTITY_INSERT enquiries OFF; END TRY BEGIN CATCH END CATCH;
    PRINT 'Inserted legacy enquiry: ID 99999 (Case 3 — Commercial Retainer)';
END
ELSE PRINT 'Enquiry ID 99999 already exists — skipped';

PRINT '══ Core Data DB seed complete ══';

-- ═════════════════════════════════════════════════════════════════════════════
-- SUMMARY
-- ═════════════════════════════════════════════════════════════════════════════
-- Tables seeded (Instructions DB):
--   Instructions ×3, Deals ×3, PitchContent ×2, IDVerifications ×2,
--   RiskAssessment ×1, Payments ×1, Documents ×4, Matters ×1,
--   dbo.enquiries (new-space) ×3
--
-- Tables seeded (Core Data DB):
--   enquiries (legacy) ×3
--
-- Pipeline coverage per case:
--   Case 1 (HLX-DEMO-00001):      Instruction ✓ Deal ✓
--   Case 2 (HLX-DEMO-0002-00001): Instruction ✓ Deal ✓ Pitch ✓ EID(Refer) ✓ Doc ✓
--   Case 3 (HELIX01-01):          Instruction ✓ Deal ✓ Pitch ✓ EID(Pass) ✓ Risk ✓
--                                  Payment ✓ Docs×3 ✓ Matter ✓
-- ═════════════════════════════════════════════════════════════════════════════
