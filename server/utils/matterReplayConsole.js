const { sql, withRequest } = require('./db');
const { runMatterReplay, validateInstructionRef, validateInitials } = require('./matterReplay');
const opLog = require('./opLog');

const CONFIRMATION_PHRASE = 'REPLAY MATTER';
const DEFAULT_LIMIT = 40;
const DEFAULT_WINDOW_DAYS = 14;

const REPAIR_FIELDS = [
  { key: 'feeEarnerInitials', label: 'Fee earner initials', required: true, maxLength: 8 },
  { key: 'feeEarner', label: 'Fee earner', required: false, maxLength: 100 },
  { key: 'originatingSolicitor', label: 'Originating solicitor', required: false, maxLength: 100 },
  { key: 'supervisingPartner', label: 'Supervising partner', required: false, maxLength: 100 },
  { key: 'practiceArea', label: 'Practice area', required: true, maxLength: 120 },
  { key: 'description', label: 'Matter description', required: true, maxLength: 500 },
  { key: 'source', label: 'Source', required: true, maxLength: 100 },
];

function getInstructionsConnectionString() {
  const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!connStr) {
    const error = new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not configured');
    error.statusCode = 500;
    error.code = 'instructions_sql_not_configured';
    throw error;
  }
  return connStr;
}

function userError(code, message, statusCode = 400, details = undefined) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  if (details !== undefined) error.details = details;
  return error;
}

function parseInstructionRef(raw) {
  const value = validateInstructionRef(raw);
  const match = value.match(/^(?:[A-Z]+-)?(\d+)-(\d+)$/i);
  return {
    instructionRef: value,
    prospectId: match ? match[1] : '',
    passcode: match ? match[2] : '',
  };
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function firstText(...values) {
  for (const value of values) {
    const text = cleanText(value);
    if (text) return text;
  }
  return '';
}

function nullableText(value) {
  const text = cleanText(value);
  return text || null;
}

function normalizeStatus(value) {
  const status = cleanText(value).toLowerCase();
  if (status === 'all' || status === 'open' || status === 'pending' || status === 'failed') return status;
  return 'all';
}

function normalizeLimit(value) {
  const limit = Number(value);
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.max(10, Math.min(120, Math.floor(limit)));
}

function normalizeWindowDays(value) {
  const days = Number(value);
  if (!Number.isFinite(days)) return DEFAULT_WINDOW_DAYS;
  return Math.max(1, Math.min(31, Math.ceil(days)));
}

function combineDateTime(openDate, openTime) {
  const date = cleanText(openDate);
  if (!date) return null;
  const time = cleanText(openTime) || '00:00:00';
  return `${date}T${time}`;
}

function isNumericId(value) {
  return /^\d{5,}$/.test(cleanText(value));
}

function isMatterRequest(row) {
  return cleanText(row?.Status).toLowerCase() === 'matterrequest';
}

function buildStep(key, label, state, detail, meta = {}) {
  return { key, label, state, detail, ...meta };
}

function buildProcessSteps(matterRows, instruction) {
  const rows = Array.isArray(matterRows) ? matterRows : [];
  const pendingRows = rows.filter(isMatterRequest);
  const hasMatterRequest = rows.length > 0;
  const hasMatterClient = rows.some((row) => cleanText(row.ClientID));
  const hasInstructionClient = cleanText(instruction?.ClientId);
  const hasClient = Boolean(hasMatterClient || hasInstructionClient);
  const hasDisplay = rows.some((row) => cleanText(row.DisplayNumber));
  const hasNumericMatter = rows.some((row) => cleanText(row.Status).toLowerCase() === 'open' || isNumericId(row.MatterID));
  const hasInstructionMatter = cleanText(instruction?.MatterId);
  const hasClioMatter = Boolean(hasDisplay || hasNumericMatter || hasInstructionMatter);
  const hasInstructionSync = Boolean(hasInstructionClient && hasInstructionMatter);
  const patchedRows = rows.filter((row) => cleanText(row.ClientID) && cleanText(row.DisplayNumber));
  const hasPatch = patchedRows.length > 0 || (hasClioMatter && pendingRows.length === 0);
  const duplicatePending = pendingRows.length > 1;
  // If Instructions has both ClientId + MatterId, treat the request as fully patched at the
  // instruction level even if a pending placeholder row was never stamped in Matters.
  const patchEffective = hasPatch || hasInstructionSync;
  const patchDetail = duplicatePending
    ? `${pendingRows.length} pending placeholder rows remain for this instruction; clean-up only.`
    : patchEffective
      ? hasPatch
        ? 'The local matter row is stamped with final identifiers.'
        : 'Instructions has ClientId and MatterId; placeholder was not stamped but the request is complete.'
      : hasMatterRequest
        ? 'The placeholder has not been stamped with final identifiers.'
        : 'No matter request to patch.';
  const patchState = patchEffective
    ? 'complete'
    : duplicatePending
      ? 'warning'
      : hasMatterRequest
        ? 'missing'
        : 'pending';

  return [
    buildStep(
      'opponents',
      'Opponent details synced',
      hasMatterRequest ? 'inferred' : 'pending',
      hasMatterRequest ? 'Matter request exists, so opponent sync was at least attempted.' : 'No local matter request row yet.',
    ),
    buildStep(
      'matter-request',
      'Matter Request Created',
      hasMatterRequest ? 'complete' : 'missing',
      hasMatterRequest ? `${rows.length} Hub matter row${rows.length === 1 ? '' : 's'} found.` : 'No Matters row found for this instruction.',
    ),
    buildStep(
      'clio-contacts',
      'Clio Contact Created/Updated',
      hasClient ? 'complete' : hasMatterRequest ? 'missing' : 'pending',
      hasClient ? 'Client ID is present in Hub or Instructions.' : 'No ClientID has been stamped yet.',
    ),
    buildStep(
      'clio-matter',
      'Clio Matter Opened',
      hasClioMatter ? 'complete' : hasMatterRequest ? 'failed' : 'pending',
      hasClioMatter ? 'A Clio matter id or display number is present.' : 'No Clio matter id or display number is present.',
    ),
    buildStep(
      'instruction-sync',
      'Instructions Database Synced',
      hasInstructionSync ? 'complete' : hasClioMatter ? 'missing' : 'pending',
      hasInstructionSync ? 'Instructions has both ClientId and MatterId.' : 'Instructions linkage is incomplete.',
    ),
    buildStep(
      'matter-request-patch',
      'Matter Request Patched',
      patchState,
      patchDetail,
    ),
  ];
}

function deriveStatus(steps) {
  const failed = steps.find((step) => step.state === 'failed' || step.state === 'missing');
  const warning = steps.find((step) => step.state === 'warning');
  if (failed) return { key: failed.state === 'failed' ? 'failed' : 'incomplete', label: failed.label, issue: failed.detail };
  if (warning) return { key: 'needs-cleanup', label: warning.label, issue: warning.detail };
  return { key: 'open', label: 'Open', issue: '' };
}

function loadOpsEventsFor(instructionRef) {
  const ref = cleanText(instructionRef).toLowerCase();
  if (!ref) return [];
  try {
    const events = opLog.list({ type: 'activity.matter-opening', limit: 1000 });
    return events
      .filter((event) => cleanText(event?.instructionRef).toLowerCase() === ref)
      .map((event) => ({
        id: event.id,
        ts: event.ts,
        status: event.status || 'info',
        step: event.step || '',
        title: event.title || 'Matter opening event',
        summary: event.summary || '',
        initials: event.initials || '',
        traceId: event.traceId || '',
        error: event.error || null,
      }));
  } catch (_) {
    return [];
  }
}

function summarizeOpsEvents(events) {
  const list = Array.isArray(events) ? events : [];
  const errorEvents = list.filter((event) => event.status === 'error');
  return {
    total: list.length,
    errors: errorEvents.length,
    lastTs: list.length ? list[0].ts : null,
    lastError: errorEvents[0] || null,
  };
}

function mapMatterRow(row) {
  return {
    matterId: cleanText(row.MatterID),
    instructionRef: cleanText(row.InstructionRef),
    status: cleanText(row.Status) || 'unknown',
    openedAt: combineDateTime(row.OpenDate, row.OpenTime),
    clientId: nullableText(row.ClientID),
    displayNumber: nullableText(row.DisplayNumber),
    clientName: nullableText(row.ClientName),
    clientType: nullableText(row.ClientType),
    description: nullableText(row.Description),
    practiceArea: nullableText(row.PracticeArea),
    responsibleSolicitor: nullableText(row.ResponsibleSolicitor),
    originatingSolicitor: nullableText(row.OriginatingSolicitor),
    supervisingPartner: nullableText(row.SupervisingPartner),
    source: nullableText(row.Source),
  };
}

function mapInstruction(instruction) {
  if (!instruction) return null;
  return {
    instructionRef: nullableText(instruction.InstructionRef),
    prospectId: nullableText(instruction.ProspectId),
    stage: nullableText(instruction.Stage),
    internalStatus: nullableText(instruction.InternalStatus),
    clientType: nullableText(instruction.ClientType),
    helixContact: nullableText(instruction.HelixContact),
    clientId: nullableText(instruction.ClientId),
    matterId: nullableText(instruction.MatterId),
    lastUpdated: instruction.LastUpdated ? new Date(instruction.LastUpdated).toISOString() : null,
    emailPresent: Boolean(cleanText(instruction.Email)),
    phonePresent: Boolean(cleanText(instruction.Phone)),
    dobPresent: Boolean(cleanText(instruction.DOB)),
    companyNamePresent: Boolean(cleanText(instruction.CompanyName)),
  };
}

function buildClientLabel(row, instruction) {
  const fullName = [instruction?.FirstName, instruction?.LastName].map(cleanText).filter(Boolean).join(' ');
  return firstText(row?.ClientName, instruction?.CompanyName, fullName, instruction?.ProspectId, 'Unknown client');
}

function buildRepairDefaults(matterRows, instruction, deal) {
  const preferredMatter = matterRows.find(isMatterRequest) || matterRows[0] || {};
  const helixContact = cleanText(instruction?.HelixContact).toUpperCase();
  const responsible = firstText(preferredMatter.ResponsibleSolicitor, helixContact);
  const description = firstText(preferredMatter.Description, deal?.ServiceDescription, instruction?.Claim, 'Advice on claim');
  const source = firstText(preferredMatter.Source, deal?.Source, deal?.source, 'unknown');
  return {
    feeEarnerInitials: helixContact || cleanText(preferredMatter.CreatedBy).toUpperCase(),
    feeEarner: responsible,
    originatingSolicitor: firstText(preferredMatter.OriginatingSolicitor, responsible),
    supervisingPartner: firstText(preferredMatter.SupervisingPartner, 'Alex'),
    practiceArea: firstText(preferredMatter.PracticeArea, deal?.AreaOfWork, 'General'),
    description,
    source,
  };
}

function normalizeRepairInput(rawRepair, defaults = {}) {
  const raw = rawRepair && typeof rawRepair === 'object' ? rawRepair : {};
  const normalized = {};
  for (const field of REPAIR_FIELDS) {
    const value = raw[field.key] !== undefined ? raw[field.key] : defaults[field.key];
    normalized[field.key] = cleanText(value).slice(0, field.maxLength);
  }
  return normalized;
}

function validateRepairValues(repair, context = {}) {
  const fieldResults = [];
  const errors = [];
  const warnings = [];

  for (const field of REPAIR_FIELDS) {
    const value = cleanText(repair[field.key]);
    let ok = true;
    let severity = 'ok';
    let message = 'Ready';

    if (field.required && !value) {
      ok = false;
      severity = 'error';
      message = `${field.label} is required`;
    } else if (field.key === 'feeEarnerInitials') {
      try {
        validateInitials(value);
      } catch (error) {
        ok = false;
        severity = 'error';
        message = error.userMessage || 'Initials must be 2 to 8 letters';
      }
    } else if (field.key === 'description' && value.length < 10) {
      ok = false;
      severity = 'error';
      message = 'Description must be at least 10 characters';
    } else if (field.key === 'source' && value.toLowerCase() === 'unknown') {
      severity = 'warning';
      message = 'Unknown source is allowed, but check it before live replay';
    }

    if (!ok) errors.push(message);
    else if (severity === 'warning') warnings.push(message);
    fieldResults.push({ field: field.key, label: field.label, value, ok, severity, message });
  }

  if (!context.instructionFound) {
    errors.push('Instruction row was not found');
  }
  if (context.currentStep === 'clio-matter' && !cleanText(repair.originatingSolicitor)) {
    warnings.push('Clio matter create failed before. Confirm the originating solicitor before live replay.');
  }

  return {
    ok: errors.length === 0,
    errors: Array.from(new Set(errors)),
    warnings: Array.from(new Set(warnings)),
    fieldResults,
  };
}

function buildRepairFocus(status) {
  if (status.label === 'Clio Matter Opened') {
    return [
      { field: 'feeEarnerInitials', reason: 'Controls which Clio user token the replay uses.' },
      { field: 'originatingSolicitor', reason: 'Must line up with the token user for Clio matter creation.' },
      { field: 'practiceArea', reason: 'Feeds the Clio matter payload and folder rules.' },
      { field: 'description', reason: 'Used as the matter description sent to Clio.' },
    ];
  }
  if (status.label === 'Clio Contact Created/Updated') {
    return [
      { field: 'feeEarnerInitials', reason: 'Used for protected route identity and token lookup.' },
      { field: 'source', reason: 'Required before replaying the intake payload.' },
    ];
  }
  return [
    { field: 'feeEarnerInitials', reason: 'Replay needs a valid fee earner identity.' },
    { field: 'description', reason: 'Replay needs a usable matter description.' },
  ];
}

function summarizeGroup(rows) {
  const sorted = rows.slice().sort((a, b) => String(b.OpenDate || '').localeCompare(String(a.OpenDate || '')) || String(b.OpenTime || '').localeCompare(String(a.OpenTime || '')));
  const first = sorted[0] || {};
  const pendingRow = sorted.find(isMatterRequest) || null;
  const instruction = {
    ClientId: first.InstructionClientId,
    MatterId: first.InstructionMatterId,
    HelixContact: first.HelixContact,
    FirstName: first.FirstName,
    LastName: first.LastName,
    CompanyName: first.CompanyName,
  };
  const steps = buildProcessSteps(sorted, instruction);
  const status = deriveStatus(steps);
  const completed = steps.filter((step) => step.state === 'complete' || step.state === 'inferred').length;
  const opsSummary = summarizeOpsEvents(loadOpsEventsFor(first.InstructionRef));
  // If we have matching error events but the matter is open, surface a warning hint.
  let issue = status.issue;
  if (status.key === 'open' && opsSummary.errors > 0) {
    issue = `Resolved after ${opsSummary.errors} submission error${opsSummary.errors === 1 ? '' : 's'}.`;
  }
  return {
    instructionRef: cleanText(first.InstructionRef),
    matterRequestId: nullableText(pendingRow?.MatterID),
    matterId: nullableText(first.InstructionMatterId || (sorted.find((row) => isNumericId(row.MatterID)) || {}).MatterID),
    openedAt: combineDateTime(first.OpenDate, first.OpenTime),
    status: status.key,
    statusLabel: status.label,
    issue,
    duplicateCount: sorted.length,
    clientLabel: buildClientLabel(first, instruction),
    feeEarner: firstText(first.ResponsibleSolicitor, first.HelixContact),
    practiceArea: firstText(first.PracticeArea, first.AreaOfWork),
    displayNumber: nullableText(first.DisplayNumber),
    stepSummary: { completed, total: steps.length, current: status.label },
    submissions: opsSummary,
  };
}

async function listRecentOpeningRequests(options = {}) {
  const status = normalizeStatus(options.status);
  const limit = normalizeLimit(options.limit);
  const days = normalizeWindowDays(options.days);
  const connStr = getInstructionsConnectionString();

  const rows = await withRequest(connStr, async (request, sqlLib) => {
    const result = await request
      .input('limit', sqlLib.Int, limit)
      .input('days', sqlLib.Int, days)
      .input('status', sqlLib.NVarChar(20), status)
      .query(`
        SELECT TOP (@limit)
          m.MatterID,
          m.InstructionRef,
          m.Status,
          CONVERT(varchar(10), m.OpenDate, 23) AS OpenDate,
          CONVERT(varchar(8), m.OpenTime, 108) AS OpenTime,
          m.ClientID,
          m.DisplayNumber,
          m.ClientName,
          m.ClientType,
          m.Description,
          m.PracticeArea,
          m.ResponsibleSolicitor,
          m.OriginatingSolicitor,
          m.SupervisingPartner,
          m.Source,
          i.Stage,
          i.InternalStatus,
          i.ClientId AS InstructionClientId,
          i.MatterId AS InstructionMatterId,
          i.HelixContact,
          i.FirstName,
          i.LastName,
          i.CompanyName,
          d.AreaOfWork,
          d.ServiceDescription
        FROM Matters m
        OUTER APPLY (
          SELECT TOP 1 *
          FROM Instructions i
          WHERE i.InstructionRef = m.InstructionRef
          ORDER BY i.LastUpdated DESC
        ) i
        OUTER APPLY (
          SELECT TOP 1 *
          FROM Deals d
          WHERE d.InstructionRef = m.InstructionRef
          ORDER BY d.DealId DESC
        ) d
        WHERE NULLIF(LTRIM(RTRIM(m.InstructionRef)), '') IS NOT NULL
          AND (m.OpenDate IS NULL OR m.OpenDate >= DATEADD(day, -@days, CONVERT(date, GETDATE())))
          AND (
            @status = 'all'
            OR (@status = 'pending' AND m.Status = 'MatterRequest')
            OR (@status = 'open' AND m.Status = 'Open')
            OR (@status = 'failed' AND (m.Status = 'MatterRequest' OR NULLIF(LTRIM(RTRIM(m.ClientID)), '') IS NULL OR NULLIF(LTRIM(RTRIM(m.DisplayNumber)), '') IS NULL))
          )
        ORDER BY CASE WHEN m.Status = 'MatterRequest' THEN 0 ELSE 1 END, m.OpenDate DESC, m.OpenTime DESC
      `);
    return result.recordset || [];
  });

  const grouped = new Map();
  for (const row of rows) {
    const key = cleanText(row.InstructionRef);
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  return {
    status,
    days,
    limit,
    requests: Array.from(grouped.values()).map(summarizeGroup),
  };
}

async function loadReplayDetail(rawInstructionRef) {
  const parsed = parseInstructionRef(rawInstructionRef);
  const connStr = getInstructionsConnectionString();

  const data = await withRequest(connStr, async (request, sqlLib) => {
    const result = await request
      .input('instructionRef', sqlLib.NVarChar(100), parsed.instructionRef)
      .input('prospectId', sqlLib.NVarChar(100), parsed.prospectId)
      .query(`
        SELECT TOP 1 *
        FROM Instructions
        WHERE InstructionRef = @instructionRef
        ORDER BY LastUpdated DESC;

        SELECT TOP 20
          MatterID,
          InstructionRef,
          Status,
          CONVERT(varchar(10), OpenDate, 23) AS OpenDate,
          CONVERT(varchar(8), OpenTime, 108) AS OpenTime,
          ClientID,
          DisplayNumber,
          ClientName,
          ClientType,
          Description,
          PracticeArea,
          ResponsibleSolicitor,
          OriginatingSolicitor,
          SupervisingPartner,
          Source
        FROM Matters
        WHERE InstructionRef = @instructionRef
        ORDER BY OpenDate DESC, OpenTime DESC;

        SELECT TOP 1 *
        FROM Deals
        WHERE InstructionRef = @instructionRef
        ORDER BY DealId DESC;

        SELECT TOP 1 *
        FROM IdVerifications
        WHERE InstructionRef = @instructionRef
        ORDER BY InternalId DESC;
      `);
    return {
      instruction: result.recordsets?.[0]?.[0] || null,
      matters: result.recordsets?.[1] || [],
      deal: result.recordsets?.[2]?.[0] || null,
      idVerification: result.recordsets?.[3]?.[0] || null,
    };
  });

  if (!data.instruction && data.matters.length === 0) {
    throw userError('opening_request_not_found', `No opening request found for ${parsed.instructionRef}`, 404);
  }

  const steps = buildProcessSteps(data.matters, data.instruction);
  const status = deriveStatus(steps);
  const submissionEvents = loadOpsEventsFor(parsed.instructionRef);
  const submissions = summarizeOpsEvents(submissionEvents);
  const repairDefaults = buildRepairDefaults(data.matters, data.instruction, data.deal);
  const validation = validateRepairValues(repairDefaults, {
    instructionFound: Boolean(data.instruction),
    currentStep: steps.find((step) => step.state === 'failed' || step.state === 'missing')?.key || '',
  });

  return {
    instructionRef: parsed.instructionRef,
    status: status.key,
    statusLabel: status.label,
    issue: status.key === 'open' && submissions.errors > 0
      ? `Resolved after ${submissions.errors} submission error${submissions.errors === 1 ? '' : 's'}.`
      : status.issue,
    processSteps: steps,
    repairFields: REPAIR_FIELDS,
    repairDefaults,
    repairFocus: buildRepairFocus(status),
    validation,
    matterRequestId: nullableText((data.matters.find(isMatterRequest) || {}).MatterID),
    instruction: mapInstruction(data.instruction),
    matterRows: data.matters.map(mapMatterRow),
    submissionEvents,
    submissions,
    deal: data.deal ? {
      dealId: data.deal.DealId ?? null,
      areaOfWork: nullableText(data.deal.AreaOfWork),
      serviceDescription: nullableText(data.deal.ServiceDescription),
      source: nullableText(data.deal.Source || data.deal.source),
    } : null,
    idVerification: data.idVerification ? {
      eidStatus: nullableText(data.idVerification.EIDStatus),
      eidOverallResult: nullableText(data.idVerification.EIDOverallResult),
      pepSanctionsResult: nullableText(data.idVerification.PEPAndSanctionsCheckResult),
      addressVerificationResult: nullableText(data.idVerification.AddressVerificationResult),
    } : null,
  };
}

async function validateReplayRepair(rawInstructionRef, rawRepair) {
  const detail = await loadReplayDetail(rawInstructionRef);
  const repair = normalizeRepairInput(rawRepair, detail.repairDefaults);
  const validation = validateRepairValues(repair, {
    instructionFound: Boolean(detail.instruction),
    currentStep: detail.processSteps.find((step) => step.state === 'failed' || step.state === 'missing')?.key || '',
  });
  return { instructionRef: detail.instructionRef, repair, validation };
}

async function saveReplayRepair(options = {}) {
  const detail = await loadReplayDetail(options.instructionRef);
  const repair = normalizeRepairInput(options.repair, detail.repairDefaults);
  const validation = validateRepairValues(repair, {
    instructionFound: Boolean(detail.instruction),
    currentStep: detail.processSteps.find((step) => step.state === 'failed' || step.state === 'missing')?.key || '',
  });
  if (!validation.ok) {
    throw userError('repair_validation_failed', 'Repair values are not valid yet', 400, validation);
  }

  const pendingRow = detail.matterRows.find((row) => cleanText(row.status).toLowerCase() === 'matterrequest');
  const targetMatterId = cleanText(options.matterRequestId) || cleanText(pendingRow?.matterId);
  if (!targetMatterId) {
    throw userError('no_pending_matter_request', 'No pending MatterRequest placeholder is available to repair', 400);
  }

  const connStr = getInstructionsConnectionString();
  const result = await withRequest(connStr, async (request, sqlLib) => {
    return request
      .input('instructionRef', sqlLib.NVarChar(100), detail.instructionRef)
      .input('matterId', sqlLib.NVarChar(255), targetMatterId)
      .input('feeEarnerInitials', sqlLib.NVarChar(20), repair.feeEarnerInitials)
      .input('feeEarner', sqlLib.NVarChar(255), repair.feeEarner || repair.feeEarnerInitials)
      .input('originatingSolicitor', sqlLib.NVarChar(255), repair.originatingSolicitor || repair.feeEarner || repair.feeEarnerInitials)
      .input('supervisingPartner', sqlLib.NVarChar(255), repair.supervisingPartner || 'Alex')
      .input('practiceArea', sqlLib.NVarChar(255), repair.practiceArea)
      .input('description', sqlLib.NVarChar(sqlLib.MAX), repair.description)
      .input('source', sqlLib.NVarChar(255), repair.source)
      .query(`
        UPDATE Matters
        SET ResponsibleSolicitor = @feeEarner,
            OriginatingSolicitor = @originatingSolicitor,
            SupervisingPartner = @supervisingPartner,
            PracticeArea = @practiceArea,
            Description = @description,
            Source = @source
        WHERE MatterID = @matterId
          AND InstructionRef = @instructionRef
          AND Status = 'MatterRequest';

        UPDATE Instructions
        SET HelixContact = @feeEarnerInitials,
            LastUpdated = SYSUTCDATETIME()
        WHERE InstructionRef = @instructionRef;
      `);
  });

  const matterRowsUpdated = Number(result.rowsAffected?.[0] || 0);
  const instructionRowsUpdated = Number(result.rowsAffected?.[1] || 0);
  if (matterRowsUpdated === 0) {
    throw userError('pending_matter_request_not_updated', 'Pending MatterRequest placeholder was not updated', 404);
  }

  return {
    instructionRef: detail.instructionRef,
    matterRequestId: targetMatterId,
    repair,
    validation,
    updated: {
      matterRows: matterRowsUpdated,
      instructionRows: instructionRowsUpdated,
    },
  };
}

async function runReplayFromConsole(options = {}) {
  const detail = await loadReplayDetail(options.instructionRef);
  const repair = normalizeRepairInput(options.repair, detail.repairDefaults);
  const validated = validateRepairValues(repair, {
    instructionFound: Boolean(detail.instruction),
    currentStep: detail.processSteps.find((step) => step.state === 'failed' || step.state === 'missing')?.key || '',
  });
  if (!validated.ok) {
    throw userError('replay_validation_failed', 'Replay repair values are not valid yet', 400, validated);
  }

  const dryRun = options.dryRun !== false;
  if (!dryRun && cleanText(options.confirmationPhrase) !== CONFIRMATION_PHRASE) {
    throw userError('confirmation_required', `Type ${CONFIRMATION_PHRASE} to run a live replay`, 400);
  }

  const initials = validateInitials(repair.feeEarnerInitials);
  const result = await runMatterReplay({
    instructionRef: detail.instructionRef,
    initials,
    dryRun,
    baseUrl: options.baseUrl,
    matterRequestId: cleanText(options.matterRequestId) || detail.matterRequestId,
    identity: options.identity || {},
    overrides: {
      feeEarner: repair.feeEarner,
      originatingSolicitor: repair.originatingSolicitor,
      supervisingPartner: repair.supervisingPartner,
      practiceArea: repair.practiceArea,
      description: repair.description,
      source: repair.source,
    },
    timeoutMs: dryRun ? 120000 : 180000,
  });

  return {
    instructionRef: detail.instructionRef,
    dryRun,
    repair,
    validation: validated,
    result,
  };
}

module.exports = {
  CONFIRMATION_PHRASE,
  listRecentOpeningRequests,
  loadReplayDetail,
  saveReplayRepair,
  validateReplayRepair,
  runReplayFromConsole,
};