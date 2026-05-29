const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env'), override: false });

const express = require('express');
const { withRequest, sql } = require('../utils/db');
const { emitEvent } = require('../utils/eventEmitter');
const { trackEvent, trackException, trackMetric } = require('../utils/appInsights');
const router = express.Router();

const RISK_LOOKUP_OPERATION = 'RiskAssessment.Lookup';

const workbenchRiskSelectColumns = `
    MatterId,
    InstructionRef,
    RiskAssessor,
    ComplianceDate,
    ComplianceExpiry,
    ClientType,
    ClientType_Value,
    DestinationOfFunds,
    DestinationOfFunds_Value,
    FundsType,
    FundsType_Value,
    HowWasClientIntroduced,
    HowWasClientIntroduced_Value,
    Limitation,
    Limitation_Value,
    SourceOfFunds,
    SourceOfFunds_Value,
    ValueOfInstruction,
    ValueOfInstruction_Value,
    RiskAssessmentResult,
    RiskScore,
    RiskScoreIncrementBy,
    TransactionRiskLevel,
    ClientRiskFactorsConsidered,
    TransactionRiskFactorsConsidered,
    FirmWideAMLPolicyConsidered,
    FirmWideSanctionsRiskConsidered
`;

function asTrimmedString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function getRequestInitials(req) {
    return asTrimmedString(req.user?.initials || req.user?.Initials || req.body?.initials || req.query?.initials || req.headers?.['x-helix-initials'] || req.headers?.['x-user-initials']).toUpperCase();
}

function getRequestEmail(req) {
    return asTrimmedString(req.user?.email || req.user?.Email || req.body?.email || req.query?.email || req.headers?.['x-user-email']).toLowerCase();
}

function getActor(req) {
    return getRequestInitials(req) || getRequestEmail(req) || 'unknown';
}

function isLocalRequest(req) {
    const host = asTrimmedString(req.headers?.host).toLowerCase();
    return process.env.NODE_ENV !== 'production'
        || host.startsWith('localhost')
        || host.startsWith('127.0.0.1')
        || host.startsWith('[::1]');
}

function canUseRiskLookup(req) {
    const initials = getRequestInitials(req);
    const email = getRequestEmail(req);
    return isLocalRequest(req)
        || initials === 'LZ'
        || initials === 'EA'
        || email === 'lz@helix-law.com'
        || email === 'ea@helix-law.com';
}

function compactRef(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function numericPart(value) {
    const match = String(value || '').match(/\d+/g);
    return match ? match.join('') : '';
}

function compactSql(columnName) {
    return `UPPER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(${columnName}, ' ', ''), '-', ''), '/', ''), '&', ''), '.', ''), '_', ''))`;
}

function bindMatterRef(request, sqlClient, ref) {
    request.input('matterRef', sqlClient.NVarChar(100), ref);
    request.input('matterRefPrefix', sqlClient.NVarChar(120), `${ref}%`);
    request.input('matterRefCompactPrefix', sqlClient.NVarChar(120), `${compactRef(ref)}%`);
    request.input('matterRefNumericLike', sqlClient.NVarChar(120), `%${numericPart(ref)}%`);
}

function uniqueStrings(values) {
    return Array.from(new Set(values.map((value) => asTrimmedString(value)).filter(Boolean)));
}

function uniqueRows(rows, keySelector) {
    const seen = new Set();
    const result = [];
    rows.forEach((row) => {
        const key = keySelector(row);
        if (seen.has(key)) return;
        seen.add(key);
        result.push(row);
    });
    return result;
}

function toDateOnly(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toISOString().slice(0, 10);
}

function cleanValue(value) {
    const text = String(value ?? '').trim();
    return text || 'Not recorded';
}

function cleanBoolean(value) {
    if (value === true || value === 1 || value === '1') return 'Yes';
    if (value === false || value === 0 || value === '0') return 'No';
    return cleanValue(value);
}

function scoreSuffix(value) {
    const text = String(value ?? '').trim();
    return text ? ` (score ${text})` : '';
}

function answerLine(label, answer, score) {
    return `- ${label}: ${cleanValue(answer)}${scoreSuffix(score)}`;
}

function safeFilePart(value) {
    return String(value || 'risk-assessment')
        .replace(/[<>:"/\\|?*]+/g, '-')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'risk-assessment';
}

function mapRiskRow(row) {
    return {
        matterId: row.ClioMatterId || row.MatterId || null,
        storedMatterId: row.MatterId || null,
        clientId: row.ClientID || null,
        checkId: row.CheckId || null,
        instructionRef: row.InstructionRef || null,
        riskAssessor: row.RiskAssessor || null,
        complianceDate: toDateOnly(row.ComplianceDate),
        complianceExpiry: toDateOnly(row.ComplianceExpiry),
        clientType: row.ClientType || null,
        clientTypeValue: row.ClientType_Value ?? null,
        destinationOfFunds: row.DestinationOfFunds || null,
        destinationOfFundsValue: row.DestinationOfFunds_Value ?? null,
        fundsType: row.FundsType || null,
        fundsTypeValue: row.FundsType_Value ?? null,
        howWasClientIntroduced: row.HowWasClientIntroduced || null,
        howWasClientIntroducedValue: row.HowWasClientIntroduced_Value ?? null,
        limitation: row.Limitation || null,
        limitationValue: row.Limitation_Value ?? null,
        sourceOfFunds: row.SourceOfFunds || null,
        sourceOfFundsValue: row.SourceOfFunds_Value ?? null,
        valueOfInstruction: row.ValueOfInstruction || null,
        valueOfInstructionValue: row.ValueOfInstruction_Value ?? null,
        riskAssessmentResult: row.RiskAssessmentResult || null,
        riskScore: row.RiskScore ?? null,
        riskScoreIncrementBy: row.RiskScoreIncrementBy ?? null,
        transactionRiskLevel: row.TransactionRiskLevel || null,
        clientRiskFactorsConsidered: row.ClientRiskFactorsConsidered,
        transactionRiskFactorsConsidered: row.TransactionRiskFactorsConsidered,
        firmWideAmlPolicyConsidered: row.FirmWideAMLPolicyConsidered,
        firmWideSanctionsRiskConsidered: row.FirmWideSanctionsRiskConsidered,
    };
}

function mapIdVerificationRow(row) {
    if (!row) return null;
    return {
        instructionRef: row.InstructionRef || null,
        matterId: row.MatterId || null,
        clientId: row.ClientId || null,
        prospectId: row.ProspectId || null,
        eidStatus: row.EIDStatus || null,
        eidOverallResult: row.EIDOverallResult || null,
        pepAndSanctionsCheckResult: row.PEPAndSanctionsCheckResult || null,
        addressVerificationResult: row.AddressVerificationResult || null,
        eidCheckedDate: toDateOnly(row.EIDCheckedDate),
    };
}

function mapMatterRow(row) {
    return {
        matterId: row.MatterId || null,
        clientId: row.ClientID || null,
        relatedClientId: row.RelatedClientID || null,
        instructionRef: row.InstructionRef || null,
        displayNumber: row.DisplayNumber || null,
        helixContact: row.HelixContact || null,
        openDate: toDateOnly(row.OpenDate),
    };
}

function mapMatterMatch(row) {
    return {
        matterId: row.MatterId || null,
        clientId: row.ClientID || null,
        instructionRef: row.InstructionRef || null,
        displayNumber: row.DisplayNumber || null,
        source: 'instructions-db-matters',
    };
}

function formatRiskAssessmentNote({ input, matter, risk, idVerification }) {
    const displayNumber = matter?.DisplayNumber || matter?.displayNumber || input;
    const clioMatterId = matter?.MatterId || matter?.matterId || '';
    const instructionRef = risk?.InstructionRef || risk?.instructionRef || matter?.InstructionRef || matter?.instructionRef || '';
    const generatedAt = new Date().toLocaleString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });

    return [
        'Risk Assessment File Review Note',
        `Generated: ${generatedAt}`,
        '',
        'File',
        `- Supplied ref: ${cleanValue(input)}`,
        `- Matter display ref: ${cleanValue(displayNumber)}`,
        `- Clio matter id: ${cleanValue(clioMatterId)}`,
        `- Instruction ref: ${cleanValue(instructionRef)}`,
        '',
        'Risk Summary',
        `- Risk assessment result: ${cleanValue(risk?.RiskAssessmentResult)}`,
        `- Risk score: ${cleanValue(risk?.RiskScore)}`,
        `- Risk score increment by: ${cleanValue(risk?.RiskScoreIncrementBy)}`,
        `- Transaction risk level: ${cleanValue(risk?.TransactionRiskLevel)}`,
        `- Assessed by: ${cleanValue(risk?.RiskAssessor)}`,
        `- Assessment date: ${cleanValue(toDateOnly(risk?.ComplianceDate))}`,
        `- Compliance expiry: ${cleanValue(toDateOnly(risk?.ComplianceExpiry))}`,
        '',
        'ID / Verification',
        `- Electronic ID status: ${cleanValue(idVerification?.EIDStatus)}`,
        `- Electronic ID result: ${cleanValue(idVerification?.EIDOverallResult)}`,
        `- Checked date: ${cleanValue(toDateOnly(idVerification?.EIDCheckedDate))}`,
        `- PEP and sanctions: ${cleanValue(idVerification?.PEPAndSanctionsCheckResult)}`,
        `- Address verification: ${cleanValue(idVerification?.AddressVerificationResult)}`,
        '',
        'Confirmations',
        `- Client risk factors considered: ${cleanBoolean(risk?.ClientRiskFactorsConsidered)}`,
        `- Transaction risk factors considered: ${cleanBoolean(risk?.TransactionRiskFactorsConsidered)}`,
        `- Firm-wide sanctions risk assessment considered: ${cleanBoolean(risk?.FirmWideSanctionsRiskConsidered)}`,
        `- Firm-wide AML policy considered: ${cleanBoolean(risk?.FirmWideAMLPolicyConsidered)}`,
        '',
        'Risk Answers',
        answerLine('Client type', risk?.ClientType, risk?.ClientType_Value),
        answerLine('How introduced', risk?.HowWasClientIntroduced, risk?.HowWasClientIntroduced_Value),
        answerLine('Source of funds', risk?.SourceOfFunds, risk?.SourceOfFunds_Value),
        answerLine('Destination of funds', risk?.DestinationOfFunds, risk?.DestinationOfFunds_Value),
        answerLine('Funds type', risk?.FundsType, risk?.FundsType_Value),
        answerLine('Value of instruction', risk?.ValueOfInstruction, risk?.ValueOfInstruction_Value),
        answerLine('Limitation period', risk?.Limitation, risk?.Limitation_Value),
        answerLine('Transaction risk', risk?.TransactionRiskLevel),
        '',
        'Future save checks',
        '- NetDocuments document check: Not checked in this version.',
        '- Clio risk field check: Not checked in this version.',
        '',
        'Source',
        'Instructions DB workbench tables: dbo.RiskAssessment and dbo.IDVerifications',
        '',
    ].join('\r\n');
}

async function findMatterMatches(connectionString, ref) {
    return withRequest(connectionString, async (request, sqlClient) => {
        bindMatterRef(request, sqlClient, ref);
        const result = await request.query(`
            SELECT TOP 50
                m.MatterID AS MatterId,
                m.ClientID,
                m.RelatedClientID,
                m.InstructionRef,
                m.DisplayNumber,
                m.OpenDate,
                i.HelixContact
            FROM dbo.Matters m
            LEFT JOIN dbo.Instructions i ON i.InstructionRef = m.InstructionRef
            WHERE m.MatterID = @matterRef
               OR m.InstructionRef = @matterRef
               OR m.DisplayNumber = @matterRef
               OR m.MatterID LIKE @matterRefPrefix
               OR m.InstructionRef LIKE @matterRefPrefix
               OR m.DisplayNumber LIKE @matterRefPrefix
               OR ${compactSql('m.MatterID')} LIKE @matterRefCompactPrefix
               OR ${compactSql('m.InstructionRef')} LIKE @matterRefCompactPrefix
               OR ${compactSql('m.DisplayNumber')} LIKE @matterRefCompactPrefix
               OR m.DisplayNumber LIKE @matterRefNumericLike
            ORDER BY m.OpenDate DESC
        `);
        return result.recordset || [];
    });
}

function attachMatterContextToRiskRows(riskRows, matterRows) {
    const matterById = new Map(matterRows.map((row) => [asTrimmedString(row.MatterId), row]));
    const matterByInstructionRef = new Map(matterRows.map((row) => [asTrimmedString(row.InstructionRef), row]));
    return riskRows.map((row) => {
        const matter = matterById.get(asTrimmedString(row.MatterId))
            || matterByInstructionRef.get(asTrimmedString(row.InstructionRef))
            || matterByInstructionRef.get(asTrimmedString(row.MatterId));
        return {
            ...row,
            InstructionRef: matter?.InstructionRef || row.InstructionRef || null,
            RiskAssessor: row.RiskAssessor || matter?.HelixContact || null,
            ClioMatterId: matter?.MatterId || null,
            DisplayNumber: matter?.DisplayNumber || null,
        };
    });
}

function getInstructionRefCandidates(matterRows, ref) {
    return uniqueStrings([
        ...matterRows.map((row) => row.InstructionRef),
        /^HLX-/i.test(ref) ? ref : null,
    ]);
}

async function findWorkbenchRiskRows(connectionString, matterRows, ref) {
    const instructionRefs = getInstructionRefCandidates(matterRows, ref);
    if (instructionRefs.length === 0) return [];

    return withRequest(connectionString, async (request, sqlClient) => {
        instructionRefs.forEach((key, index) => {
            request.input(`instructionRef${index}`, sqlClient.NVarChar(100), key);
        });
        const refClause = instructionRefs.map((_, index) => `@instructionRef${index}`).join(', ');
        const result = await request.query(`
            SELECT TOP 50 ${workbenchRiskSelectColumns}
            FROM dbo.RiskAssessment
            WHERE InstructionRef IN (${refClause})
               OR MatterId IN (${refClause})
            ORDER BY ComplianceDate DESC, MatterId ASC
        `);
        return attachMatterContextToRiskRows(result.recordset || [], matterRows);
    });
}

async function findIdVerificationRows(connectionString, matterRows, ref) {
    const instructionRefs = getInstructionRefCandidates(matterRows, ref);
    if (instructionRefs.length === 0) return [];

    return withRequest(connectionString, async (request, sqlClient) => {
        instructionRefs.forEach((key, index) => {
            request.input(`instructionRef${index}`, sqlClient.NVarChar(100), key);
        });
        const refClause = instructionRefs.map((_, index) => `@instructionRef${index}`).join(', ');
        const result = await request.query(`
            SELECT TOP 50
                InstructionRef,
                MatterId,
                ClientId,
                ProspectId,
                EIDStatus,
                EIDOverallResult,
                PEPAndSanctionsCheckResult,
                AddressVerificationResult,
                EIDCheckedDate
            FROM dbo.IDVerifications
            WHERE InstructionRef IN (${refClause})
               OR MatterId IN (${refClause})
            ORDER BY InternalId DESC
        `);
        return result.recordset || [];
    });
}

/**
 * Resolve a user-entered matter ref to a risk assessment note.
 * GET/POST /api/risk-assessments/lookup
 */
async function handleRiskAssessmentLookup(req, res) {
    const startedAt = Date.now();
    const actor = getActor(req);
    const matterRef = asTrimmedString(req.body?.matterRef || req.body?.ref || req.query?.matterRef || req.query?.ref);

    trackEvent('RiskAssessment.Lookup.Started', {
        operation: RISK_LOOKUP_OPERATION,
        triggeredBy: actor,
        inputLength: String(matterRef.length),
    });

    if (!canUseRiskLookup(req)) {
        trackEvent('RiskAssessment.Lookup.Forbidden', { operation: RISK_LOOKUP_OPERATION, triggeredBy: actor });
        return res.status(403).json({ error: 'forbidden', message: 'Risk assessment lookup is only available to Luke, Emma, and localhost during preview.' });
    }

    if (matterRef.length < 3) {
        return res.status(400).json({ error: 'invalid_ref', message: 'Enter at least 3 characters of a matter ref.' });
    }

    try {
        const instructionsConnectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
        if (!instructionsConnectionString) {
            throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not found in environment');
        }

        const matterRowsRaw = await findMatterMatches(instructionsConnectionString, matterRef);
        const matterRows = uniqueRows(matterRowsRaw, (row) => `${row.MatterId || ''}|${row.InstructionRef || ''}|${row.DisplayNumber || ''}`);
        const workbenchRiskRowsRaw = await findWorkbenchRiskRows(instructionsConnectionString, matterRows, matterRef);
        const idVerificationRowsRaw = await findIdVerificationRows(instructionsConnectionString, matterRows, matterRef);
        const riskRows = uniqueRows(workbenchRiskRowsRaw, (row) => `${row.InstructionRef || ''}|${row.MatterId || ''}|${toDateOnly(row.ComplianceDate) || ''}`);
        const idVerificationRows = uniqueRows(idVerificationRowsRaw, (row) => `${row.InstructionRef || ''}|${row.MatterId || ''}|${row.ClientId || ''}|${row.EIDCheckedDate || ''}`);

        const primaryMatter = matterRows[0] || null;
        const primaryRisk = riskRows[0] || null;
        const primaryIdVerification = idVerificationRows[0] || null;
        const status = primaryRisk
            ? 'risk-found'
            : primaryMatter
                ? 'matter-found-no-risk'
                : 'not-found';
        const previewText = primaryRisk
            ? formatRiskAssessmentNote({ input: matterRef, matter: primaryMatter, risk: primaryRisk, idVerification: primaryIdVerification })
            : '';
        const primaryDisplay = primaryMatter?.DisplayNumber || matterRef;
        const primaryInstructionRef = primaryRisk?.InstructionRef || primaryMatter?.InstructionRef || matterRef;
        const assessment = primaryRisk ? mapRiskRow(primaryRisk) : null;
        const idVerification = mapIdVerificationRow(primaryIdVerification);

        const durationMs = Date.now() - startedAt;
        trackEvent('RiskAssessment.Lookup.Completed', {
            operation: RISK_LOOKUP_OPERATION,
            triggeredBy: actor,
            status,
            matterCount: String(matterRows.length),
            riskCount: String(riskRows.length),
            idVerificationCount: String(idVerificationRows.length),
            durationMs: String(durationMs),
        });
        trackMetric('RiskAssessment.Lookup.Duration', durationMs, { operation: RISK_LOOKUP_OPERATION, status });

        return res.json({
            ok: true,
            input: matterRef,
            inputRef: matterRef,
            status,
            message: status === 'risk-found'
                ? 'Risk assessment found.'
                : status === 'matter-found-no-risk'
                    ? 'Matter found, but no workbench risk assessment was found.'
                    : 'No matching matter or workbench risk assessment was found.',
            resolved: {
                matterResolved: matterRows.length > 0,
                riskFound: riskRows.length > 0,
                displayNumbers: uniqueStrings(matterRows.map((row) => row.DisplayNumber)),
                instructionRefs: uniqueStrings([...matterRows.map((row) => row.InstructionRef), ...riskRows.map((row) => row.InstructionRef)]),
                matterIds: uniqueStrings([...matterRows.map((row) => row.MatterId), ...riskRows.map((row) => row.ClioMatterId || row.MatterId)]),
                prospectIds: uniqueStrings(idVerificationRows.map((row) => row.ProspectId)),
            },
            matterMatches: matterRows.map(mapMatterRow),
            matches: matterRows.map(mapMatterMatch),
            assessment,
            assessments: riskRows.map(mapRiskRow),
            idVerification,
            idVerifications: idVerificationRows.map(mapIdVerificationRow),
            previewText,
            noteText: previewText,
            fileName: primaryRisk
                ? `${safeFilePart(primaryDisplay)}_${safeFilePart(primaryInstructionRef)}_risk-assessment.txt`
                : null,
            integrations: {
                netdocuments: { status: 'not_checked' },
                clio: { status: 'not_checked' },
            },
            futureChecks: {
                netDocuments: 'not_checked',
                clioRiskField: 'not_checked',
            },
        });
    } catch (error) {
        const durationMs = Date.now() - startedAt;
        trackException(error, { operation: RISK_LOOKUP_OPERATION, triggeredBy: actor, phase: 'lookup' });
        trackEvent('RiskAssessment.Lookup.Failed', {
            operation: RISK_LOOKUP_OPERATION,
            triggeredBy: actor,
            error: error.message,
            durationMs: String(durationMs),
        });
        return res.status(500).json({ error: 'lookup_failed', message: 'Risk assessment lookup failed.' });
    }
}

router.get('/lookup', handleRiskAssessmentLookup);
router.post('/lookup', handleRiskAssessmentLookup);

/**
 * Create or update risk assessment for an instruction
 * POST /api/risk-assessments
 */
router.post('/', async (req, res) => {
    const body = req.body || {};
    const { InstructionRef, MatterId } = body;
    
    if (!InstructionRef && !MatterId) {
        return res.status(400).json({ error: 'Missing InstructionRef or MatterId' });
    }

    console.log(`[risk-assessments] Processing risk assessment for ${InstructionRef || MatterId}`);

    try {
        // Use the INSTRUCTIONS_SQL_CONNECTION_STRING from .env (same as verify-id)
        const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
        if (!connectionString) {
            throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not found in environment');
        }

        // Handle limitation date formatting like the Azure Function
        let limitation = body.Limitation || null;
        if (body.Limitation_Value === 2 || body.Limitation_Value === 3) {
            const datePart = body.LimitationDateTbc
                ? 'TBC'
                : body.LimitationDate
                    ? new Date(body.LimitationDate).toLocaleDateString('en-GB')
                    : '';
            if (datePart) limitation = `${limitation} - ${datePart}`;
        }

        await withRequest(connectionString, async (request) => {
            return request
            .input('MatterId', sql.NVarChar(50), MatterId || InstructionRef)
            .input('InstructionRef', sql.NVarChar(50), InstructionRef || null)
            .input('RiskAssessor', sql.NVarChar(100), body.RiskAssessor || null)
            .input('ComplianceDate', sql.Date, body.ComplianceDate || null)
            .input('ComplianceExpiry', sql.Date, body.ComplianceExpiry || null)
            .input('ClientType', sql.NVarChar(255), body.ClientType || null)
            .input('ClientType_Value', sql.Int, body.ClientType_Value || null)
            .input('DestinationOfFunds', sql.NVarChar(255), body.DestinationOfFunds || null)
            .input('DestinationOfFunds_Value', sql.Int, body.DestinationOfFunds_Value || null)
            .input('FundsType', sql.NVarChar(255), body.FundsType || null)
            .input('FundsType_Value', sql.Int, body.FundsType_Value || null)
            .input('HowWasClientIntroduced', sql.NVarChar(255), body.HowWasClientIntroduced || null)
            .input('HowWasClientIntroduced_Value', sql.Int, body.HowWasClientIntroduced_Value || null)
            .input('Limitation', sql.NVarChar(255), limitation)
            .input('Limitation_Value', sql.Int, body.Limitation_Value || null)
            .input('SourceOfFunds', sql.NVarChar(255), body.SourceOfFunds || null)
            .input('SourceOfFunds_Value', sql.Int, body.SourceOfFunds_Value || null)
            .input('ValueOfInstruction', sql.NVarChar(255), body.ValueOfInstruction || null)
            .input('ValueOfInstruction_Value', sql.Int, body.ValueOfInstruction_Value || null)
            .input('RiskAssessmentResult', sql.NVarChar(255), body.RiskAssessmentResult || null)
            .input('RiskScore', sql.Int, body.RiskScore || null)
            .input('RiskScoreIncrementBy', sql.Int, body.RiskScoreIncrementBy || null)
            .input('TransactionRiskLevel', sql.NVarChar(255), body.TransactionRiskLevel || null)
            .input('ClientRiskFactorsConsidered', sql.Bit, body.ClientRiskFactorsConsidered ? 1 : 0)
            .input('TransactionRiskFactorsConsidered', sql.Bit, body.TransactionRiskFactorsConsidered ? 1 : 0)
            .input('FirmWideAMLPolicyConsidered', sql.Bit, body.FirmWideAMLPolicyConsidered ? 1 : 0)
            .input('FirmWideSanctionsRiskConsidered', sql.Bit, body.FirmWideSanctionsRiskConsidered ? 1 : 0)
            .query(`
                MERGE RiskAssessment AS target
                USING (VALUES (@MatterId)) AS source (MatterId)
                ON target.MatterId = source.MatterId
                WHEN MATCHED THEN 
                    UPDATE SET 
                        InstructionRef = @InstructionRef,
                        RiskAssessor = @RiskAssessor,
                        ComplianceDate = @ComplianceDate,
                        ComplianceExpiry = @ComplianceExpiry,
                        ClientType = @ClientType,
                        ClientType_Value = @ClientType_Value,
                        DestinationOfFunds = @DestinationOfFunds,
                        DestinationOfFunds_Value = @DestinationOfFunds_Value,
                        FundsType = @FundsType,
                        FundsType_Value = @FundsType_Value,
                        HowWasClientIntroduced = @HowWasClientIntroduced,
                        HowWasClientIntroduced_Value = @HowWasClientIntroduced_Value,
                        Limitation = @Limitation,
                        Limitation_Value = @Limitation_Value,
                        SourceOfFunds = @SourceOfFunds,
                        SourceOfFunds_Value = @SourceOfFunds_Value,
                        ValueOfInstruction = @ValueOfInstruction,
                        ValueOfInstruction_Value = @ValueOfInstruction_Value,
                        RiskAssessmentResult = @RiskAssessmentResult,
                        RiskScore = @RiskScore,
                        RiskScoreIncrementBy = @RiskScoreIncrementBy,
                        TransactionRiskLevel = @TransactionRiskLevel,
                        ClientRiskFactorsConsidered = @ClientRiskFactorsConsidered,
                        TransactionRiskFactorsConsidered = @TransactionRiskFactorsConsidered,
                        FirmWideAMLPolicyConsidered = @FirmWideAMLPolicyConsidered,
                        FirmWideSanctionsRiskConsidered = @FirmWideSanctionsRiskConsidered
                WHEN NOT MATCHED THEN
                    INSERT (
                        MatterId, InstructionRef, RiskAssessor, ComplianceDate, ComplianceExpiry,
                        ClientType, ClientType_Value, DestinationOfFunds, DestinationOfFunds_Value,
                        FundsType, FundsType_Value, HowWasClientIntroduced, HowWasClientIntroduced_Value,
                        Limitation, Limitation_Value, SourceOfFunds, SourceOfFunds_Value,
                        ValueOfInstruction, ValueOfInstruction_Value, RiskAssessmentResult,
                        RiskScore, RiskScoreIncrementBy, TransactionRiskLevel,
                        ClientRiskFactorsConsidered, TransactionRiskFactorsConsidered,
                        FirmWideAMLPolicyConsidered, FirmWideSanctionsRiskConsidered
                    ) VALUES (
                        @MatterId, @InstructionRef, @RiskAssessor, @ComplianceDate, @ComplianceExpiry,
                        @ClientType, @ClientType_Value, @DestinationOfFunds, @DestinationOfFunds_Value,
                        @FundsType, @FundsType_Value, @HowWasClientIntroduced, @HowWasClientIntroduced_Value,
                        @Limitation, @Limitation_Value, @SourceOfFunds, @SourceOfFunds_Value,
                        @ValueOfInstruction, @ValueOfInstruction_Value, @RiskAssessmentResult,
                        @RiskScore, @RiskScoreIncrementBy, @TransactionRiskLevel,
                        @ClientRiskFactorsConsidered, @TransactionRiskFactorsConsidered,
                        @FirmWideAMLPolicyConsidered, @FirmWideSanctionsRiskConsidered
                    );
            `);
        });

        console.log(`[risk-assessments] Risk assessment saved successfully for ${InstructionRef || MatterId}`);

        emitEvent('risk.assessed', 'tab-app', InstructionRef || MatterId, 'risk', {
            riskScore: body.RiskScore,
            riskAssessmentResult: body.RiskAssessmentResult,
            riskAssessor: body.RiskAssessor,
        });
        
        res.status(200).json({ 
            success: true, 
            message: 'Risk assessment saved successfully',
            instructionRef: InstructionRef || MatterId
        });

    } catch (error) {
        console.error(`[risk-assessments] Error saving risk assessment:`, error);
        res.status(500).json({ 
            error: 'Failed to save risk assessment',
            details: error.message 
        });
    }
});

/**
 * Get risk assessment for an instruction
 * GET /api/risk-assessments/:instructionRef
 */
router.get('/:instructionRef', async (req, res) => {
    const { instructionRef } = req.params;
    
    if (!instructionRef) {
        return res.status(400).json({ error: 'Missing instructionRef' });
    }

    console.log(`[risk-assessments] Getting risk assessment for ${instructionRef}`);

    try {
        const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
        if (!connectionString) {
            throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not found in environment');
        }

        const result = await withRequest(connectionString, async (request) => {
            return request
                .input('ref', sql.NVarChar, instructionRef)
                .query(`
                    SELECT * FROM RiskAssessment 
                    WHERE MatterId = @ref OR InstructionRef = @ref
                `);
        });

        if (result.recordset.length === 0) {
            return res.status(404).json({ error: 'Risk assessment not found' });
        }

        res.json(result.recordset[0]);

    } catch (error) {
        console.error(`[risk-assessments] Error fetching risk assessment:`, error);
        res.status(500).json({ 
            error: 'Failed to fetch risk assessment',
            details: error.message 
        });
    }
});

module.exports = router;
/**
 * Delete risk assessment for an instruction
 * DELETE /api/risk-assessments/:instructionRef
 */
router.delete('/:instructionRef', async (req, res) => {
    const { instructionRef } = req.params;

    if (!instructionRef) {
        return res.status(400).json({ error: 'Missing instructionRef' });
    }

    console.log(`[risk-assessments] Deleting risk assessment for ${instructionRef}`);

    try {
        const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
        if (!connectionString) {
            throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not found in environment');
        }

        const result = await withRequest(connectionString, async (request) => {
            return request
                .input('ref', sql.NVarChar, instructionRef)
                .query(`
                    DELETE FROM [dbo].[RiskAssessment]
                    WHERE MatterId = @ref OR InstructionRef = @ref
                `);
        });

        const rows = result.rowsAffected?.[0] ?? 0;
        if (rows === 0) {
            return res.status(404).json({ error: 'Risk assessment not found' });
        }

        res.json({ success: true, deleted: rows });

    } catch (error) {
        console.error(`[risk-assessments] Error deleting risk assessment:`, error);
        res.status(500).json({ 
            error: 'Failed to delete risk assessment',
            details: error.message 
        });
    }
});
