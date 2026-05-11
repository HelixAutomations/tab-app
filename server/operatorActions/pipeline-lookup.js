// server/operatorActions/pipeline-lookup.js
//
// Operator action: full pipeline graph for a given input — instruction ref,
// prospect id, passcode, email, or person name. Read-only.
// Parity contract: matches `node tools/instant-lookup.mjs pipeline <input>`.

const sql = require('mssql');
const { registerAction } = require('./registry');
const {
  isEmail,
  isNumeric,
  isLikelyName,
  getTableColumns,
  buildFlexibleEnquiryWhere,
  buildStrictFullNameWhere,
  buildRecordFullName,
  normaliseNameValue,
  pickOrderBy,
} = require('./_personLookupHelpers');
const {
  parseInstructionRef,
  applyInParams,
  buildInClauseForColumns,
  generateTeamsDeepLink,
} = require('./_pipelineHelpers');

function safeFragment(value) {
  return String(value || 'pipeline').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'pipeline';
}

const pushUniqueBy = (list, record, key) => {
  if (!record) return;
  const value = record?.[key];
  if (!value) { list.push(record); return; }
  const exists = list.some((item) => String(item?.[key]) === String(value));
  if (!exists) list.push(record);
};

async function runPipelineLookup({ params }) {
  const pipelineInput = String(params.query || '').trim();
  if (!pipelineInput) {
    return { summary: 'Empty query', artefact: null, warnings: ['Empty query'] };
  }

  const coreConn = process.env.SQL_CONNECTION_STRING;
  const instrConn = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!coreConn) throw new Error('SQL_CONNECTION_STRING not configured');
  if (!instrConn) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not configured');

  const pipelineWarnings = [];
  const instructionRefs = new Set();
  const prospectIds = new Set();
  const passcodes = new Set();
  const emails = new Set();
  const dealIds = new Set();
  const matterIds = new Set();

  const parsedRef = parseInstructionRef(pipelineInput);
  if (parsedRef) {
    instructionRefs.add(parsedRef.instructionRef);
    prospectIds.add(parsedRef.prospectId);
    passcodes.add(parsedRef.passcode);
  }
  if (isNumeric(pipelineInput)) {
    prospectIds.add(pipelineInput);
    passcodes.add(pipelineInput);
  }
  if (isEmail(pipelineInput)) {
    emails.add(pipelineInput);
  }

  const instructions = [];
  const deals = [];
  const matters = [];
  const payments = [];
  const documents = [];
  const riskAssessments = [];
  const idVerifications = [];
  const pitchContent = [];
  const teamsData = [];
  let newEnquiries = [];
  let legacyEnquiries = [];

  const instrPool = await new sql.ConnectionPool(instrConn).connect();
  const corePool = await new sql.ConnectionPool(coreConn).connect();

  try {
    if (isLikelyName(pipelineInput)) {
      const nameLike = `%${pipelineInput}%`;
      const hasFullName = pipelineInput.trim().split(/\s+/).filter(Boolean).length > 1;
      const targetFullName = normaliseNameValue(pipelineInput);

      try {
        const legacyColumns = await getTableColumns(corePool, 'enquiries', 'dbo');
        const legacyWhere = hasFullName
          ? buildStrictFullNameWhere(legacyColumns, { input: pipelineInput, like: nameLike })
          : buildFlexibleEnquiryWhere(legacyColumns, { input: pipelineInput, like: nameLike });
        if (legacyWhere) {
          const req = corePool.request();
          legacyWhere.params.forEach((p) => req.input(p.name, p.type, p.value));
          legacyEnquiries = (await req.query(
            `SELECT TOP 25 * FROM enquiries WHERE ${legacyWhere.where} ORDER BY ID DESC`
          )).recordset;
        } else {
          pipelineWarnings.push('Legacy name lookup skipped: no matching columns found.');
        }
      } catch (err) {
        pipelineWarnings.push(`Legacy name lookup skipped: ${err?.message || err}`);
      }

      try {
        const newColumns = await getTableColumns(instrPool, 'enquiries', 'dbo');
        const newWhere = hasFullName
          ? buildStrictFullNameWhere(newColumns, { input: pipelineInput, like: nameLike })
          : buildFlexibleEnquiryWhere(newColumns, { input: pipelineInput, like: nameLike });
        if (newWhere) {
          const req = instrPool.request();
          newWhere.params.forEach((p) => req.input(p.name, p.type, p.value));
          const orderBy = pickOrderBy(newColumns, ['datetime', 'DateTime', 'date_created', 'Date_Created', 'ID', 'id']);
          newEnquiries = (await req.query(
            `SELECT TOP 25 * FROM dbo.enquiries WHERE ${newWhere.where}${orderBy ? ` ORDER BY ${orderBy} DESC` : ''}`
          )).recordset;
        } else {
          pipelineWarnings.push('New enquiries name lookup skipped: no matching columns found.');
        }
      } catch (err) {
        pipelineWarnings.push(`New enquiries name lookup skipped: ${err?.message || err}`);
      }

      if (hasFullName) {
        legacyEnquiries = legacyEnquiries.filter((r) => buildRecordFullName(r) === targetFullName);
        newEnquiries = newEnquiries.filter((r) => buildRecordFullName(r) === targetFullName);
      }

      legacyEnquiries.forEach((enquiry) => {
        if (enquiry?.ID !== undefined && enquiry?.ID !== null) prospectIds.add(String(enquiry.ID));
        if (enquiry?.Email) emails.add(String(enquiry.Email).trim());
        if (enquiry?.email) emails.add(String(enquiry.email).trim());
      });
      newEnquiries.forEach((enquiry) => {
        if (enquiry?.acid) prospectIds.add(String(enquiry.acid));
        if (enquiry?.id) prospectIds.add(String(enquiry.id));
        if (enquiry?.ID) prospectIds.add(String(enquiry.ID));
        if (enquiry?.email) emails.add(String(enquiry.email).trim());
        if (enquiry?.Email) emails.add(String(enquiry.Email).trim());
      });
    }

    if (instructionRefs.size > 0) {
      const req = instrPool.request();
      const inClause = applyInParams(req, Array.from(instructionRefs), 'ref', sql.VarChar);
      const rows = (await req.query(`SELECT TOP 50 * FROM Instructions WHERE InstructionRef IN (${inClause})`)).recordset;
      rows.forEach((row) => pushUniqueBy(instructions, row, 'InstructionRef'));
    }

    if (instructionRefs.size > 0) {
      const req = instrPool.request();
      const inClause = applyInParams(req, Array.from(instructionRefs), 'ref', sql.VarChar);
      const rows = (await req.query(`SELECT TOP 50 * FROM Deals WHERE InstructionRef IN (${inClause}) ORDER BY DealId DESC`)).recordset;
      rows.forEach((row) => pushUniqueBy(deals, row, 'DealId'));
    }

    if (prospectIds.size > 0) {
      const req = instrPool.request();
      const inClause = applyInParams(req, Array.from(prospectIds), 'pid', sql.VarChar);
      const rows = (await req.query(`SELECT TOP 50 * FROM Deals WHERE ProspectId IN (${inClause}) ORDER BY DealId DESC`)).recordset;
      rows.forEach((row) => pushUniqueBy(deals, row, 'DealId'));
    }

    if (passcodes.size > 0) {
      const req = instrPool.request();
      const inClause = applyInParams(req, Array.from(passcodes), 'pass', sql.VarChar);
      const rows = (await req.query(`SELECT TOP 50 * FROM Deals WHERE Passcode IN (${inClause}) ORDER BY DealId DESC`)).recordset;
      rows.forEach((row) => pushUniqueBy(deals, row, 'DealId'));
    }

    if (emails.size > 0) {
      const instructionColumns = await getTableColumns(instrPool, 'Instructions', 'dbo');
      const req = instrPool.request();
      const inClause = buildInClauseForColumns(
        instructionColumns,
        Array.from(emails),
        req,
        ['Email', 'email', 'ClientEmail', 'clientEmail'],
        'email'
      );
      if (inClause) {
        const rows = (await req.query(
          `SELECT TOP 50 * FROM Instructions WHERE ${inClause} ORDER BY InstructionRef DESC`
        )).recordset;
        rows.forEach((row) => pushUniqueBy(instructions, row, 'InstructionRef'));
      } else {
        pipelineWarnings.push('Instruction email lookup skipped: no matching email columns found.');
      }
    }

    try {
      const req = instrPool.request().input('matter', sql.VarChar, pipelineInput);
      const rows = (await req.query(
        `SELECT TOP 50 * FROM Matters WHERE MatterId = @matter OR DisplayNumber = @matter`
      )).recordset;
      rows.forEach((row) => pushUniqueBy(matters, row, 'MatterId'));
    } catch {
      try {
        const req = instrPool.request().input('matter', sql.VarChar, pipelineInput);
        const rows = (await req.query(
          `SELECT TOP 50 * FROM Matters WHERE MatterId = @matter OR [Display Number] = @matter`
        )).recordset;
        rows.forEach((row) => pushUniqueBy(matters, row, 'MatterId'));
      } catch (innerErr) {
        pipelineWarnings.push(`Matter lookup skipped: ${innerErr?.message || innerErr}`);
      }
    }

    deals.forEach((deal) => {
      if (deal?.DealId !== undefined && deal?.DealId !== null) dealIds.add(String(deal.DealId));
      if (deal?.InstructionRef) instructionRefs.add(String(deal.InstructionRef).trim());
      if (deal?.ProspectId) prospectIds.add(String(deal.ProspectId).trim());
      if (deal?.Passcode) passcodes.add(String(deal.Passcode).trim());
    });

    instructions.forEach((inst) => {
      if (inst?.InstructionRef) instructionRefs.add(String(inst.InstructionRef).trim());
      if (inst?.ProspectId) prospectIds.add(String(inst.ProspectId).trim());
      const instEmail = inst?.Email || inst?.ClientEmail;
      if (instEmail) emails.add(String(instEmail).trim());
    });

    matters.forEach((matter) => {
      if (matter?.InstructionRef) instructionRefs.add(String(matter.InstructionRef).trim());
      if (matter?.MatterId) matterIds.add(String(matter.MatterId).trim());
    });

    if (instructionRefs.size > 0) {
      const req = instrPool.request();
      const inClause = applyInParams(req, Array.from(instructionRefs), 'ref', sql.VarChar);
      const rows = (await req.query(`SELECT TOP 50 * FROM Instructions WHERE InstructionRef IN (${inClause})`)).recordset;
      rows.forEach((row) => pushUniqueBy(instructions, row, 'InstructionRef'));
    }

    if (instructionRefs.size > 0) {
      const req = instrPool.request();
      const inClause = applyInParams(req, Array.from(instructionRefs), 'ref', sql.VarChar);
      const rows = (await req.query(`SELECT TOP 50 * FROM Matters WHERE InstructionRef IN (${inClause}) ORDER BY OpenDate DESC`)).recordset;
      rows.forEach((row) => pushUniqueBy(matters, row, 'MatterId'));
    }

    if (instructionRefs.size > 0) {
      const req = instrPool.request();
      const inClause = applyInParams(req, Array.from(instructionRefs), 'ref', sql.VarChar);
      payments.push(...(await req.query(
        `SELECT * FROM Payments WHERE instruction_ref IN (${inClause}) ORDER BY id DESC`
      )).recordset);
    }

    if (instructionRefs.size > 0) {
      const req = instrPool.request();
      const inClause = applyInParams(req, Array.from(instructionRefs), 'ref', sql.VarChar);
      documents.push(...(await req.query(
        `SELECT * FROM Documents WHERE InstructionRef IN (${inClause}) ORDER BY DocumentId DESC`
      )).recordset);
    }

    if (instructionRefs.size > 0 || matterIds.size > 0) {
      const refList = Array.from(instructionRefs);
      const matterList = Array.from(matterIds);
      const req = instrPool.request();
      const refClause = refList.length > 0 ? applyInParams(req, refList, 'ref', sql.VarChar) : null;
      const matterClause = matterList.length > 0 ? applyInParams(req, matterList, 'mid', sql.VarChar) : null;
      if (refClause || matterClause) {
        const whereParts = [];
        if (refClause) whereParts.push(`InstructionRef IN (${refClause})`);
        if (matterClause) whereParts.push(`MatterId IN (${matterClause})`);
        riskAssessments.push(...(await req.query(
          `SELECT * FROM RiskAssessment WHERE ${whereParts.join(' OR ')}`
        )).recordset);
      }
    }

    if (instructionRefs.size > 0) {
      const req = instrPool.request();
      const inClause = applyInParams(req, Array.from(instructionRefs), 'ref', sql.VarChar);
      idVerifications.push(...(await req.query(
        `SELECT * FROM IDVerifications WHERE InstructionRef IN (${inClause}) ORDER BY EIDCheckedDate DESC`
      )).recordset);
    }

    if (dealIds.size > 0) {
      const req = instrPool.request();
      const inClause = applyInParams(req, Array.from(dealIds), 'deal', sql.VarChar);
      pitchContent.push(...(await req.query(
        `SELECT * FROM PitchContent WHERE DealId IN (${inClause}) ORDER BY PitchContentId DESC`
      )).recordset);
    }

    const numericPids = Array.from(prospectIds).filter(isNumeric);
    if (numericPids.length > 0) {
      try {
        const mapReq = instrPool.request();
        const mapInClause = applyInParams(mapReq, numericPids, 'acid', sql.VarChar);
        const acidMapping = (await mapReq.query(
          `SELECT id, acid FROM [dbo].[enquiries] WHERE acid IN (${mapInClause})`
        )).recordset;

        const newEnquiryIds = new Set();
        acidMapping.forEach((row) => { if (row.id) newEnquiryIds.add(String(row.id)); });
        numericPids.forEach((pid) => newEnquiryIds.add(pid));
        const allIdsToQuery = Array.from(newEnquiryIds).filter(isNumeric);

        if (allIdsToQuery.length > 0) {
          const req = instrPool.request();
          const inClause = applyInParams(req, allIdsToQuery, 'enqid', sql.Int);
          const rows = (await req.query(`
            SELECT
              Id, ActivityId, ChannelId, TeamId, EnquiryId, LeadName, Email, Phone,
              CardType, MessageTimestamp, TeamsMessageId,
              DATEDIFF_BIG(MILLISECOND, '1970-01-01', CreatedAt) AS CreatedAtMs,
              Stage, Status, ClaimedBy, ClaimedAt, CreatedAt, UpdatedAt
            FROM [dbo].[TeamsBotActivityTracking]
            WHERE EnquiryId IN (${inClause})
            ORDER BY CreatedAt DESC
          `)).recordset;
          rows.forEach((row) => {
            row.teamsLink = generateTeamsDeepLink(row.ChannelId, row.ActivityId, row.TeamId, row.TeamsMessageId, row.CreatedAtMs);
            teamsData.push(row);
          });
        }
      } catch (err) {
        pipelineWarnings.push(`Teams data lookup skipped: ${err?.message || err}`);
      }
    }

    try {
      const newColumns = await getTableColumns(instrPool, 'enquiries', 'dbo');
      const orderBy = pickOrderBy(newColumns, ['datetime', 'DateTime', 'date_created', 'Date_Created', 'ID', 'id']);
      if (prospectIds.size > 0) {
        const req = instrPool.request();
        const inClause = buildInClauseForColumns(
          newColumns,
          Array.from(prospectIds),
          req,
          ['acid', 'ACID', 'Acid', 'id', 'ID', 'EnquiryId', 'enquiryId', 'ProspectId', 'prospectId'],
          'pid'
        );
        if (inClause) {
          newEnquiries = (await req.query(
            `SELECT TOP 50 * FROM dbo.enquiries WHERE ${inClause}${orderBy ? ` ORDER BY ${orderBy} DESC` : ''}`
          )).recordset;
        } else {
          pipelineWarnings.push('New enquiries lookup skipped: no matching ID columns found.');
        }
      } else if (emails.size > 0) {
        const req = instrPool.request();
        const inClause = buildInClauseForColumns(
          newColumns,
          Array.from(emails),
          req,
          ['Email', 'email', 'ClientEmail', 'clientEmail'],
          'email'
        );
        if (inClause) {
          newEnquiries = (await req.query(
            `SELECT TOP 50 * FROM dbo.enquiries WHERE ${inClause}${orderBy ? ` ORDER BY ${orderBy} DESC` : ''}`
          )).recordset;
        } else {
          pipelineWarnings.push('New enquiries lookup skipped: no matching email columns found.');
        }
      }
    } catch (err) {
      pipelineWarnings.push(`New enquiries lookup skipped: ${err?.message || err}`);
    }

    const numericProspectIds = Array.from(prospectIds).filter(isNumeric);
    if (numericProspectIds.length > 0) {
      const req = corePool.request();
      const inClause = applyInParams(req, numericProspectIds, 'pid', sql.Int);
      legacyEnquiries = (await req.query(
        `SELECT TOP 50 * FROM enquiries WHERE ID IN (${inClause}) ORDER BY ID DESC`
      )).recordset;
    }

    if (legacyEnquiries.length === 0 && emails.size > 0) {
      const req = corePool.request();
      const inClause = applyInParams(req, Array.from(emails), 'email', sql.VarChar);
      legacyEnquiries = (await req.query(
        `SELECT TOP 50 * FROM enquiries WHERE Email IN (${inClause}) ORDER BY ID DESC`
      )).recordset;
    }
  } finally {
    try { await instrPool.close(); } catch {}
    try { await corePool.close(); } catch {}
  }

  const totalMatches =
    instructions.length + deals.length + matters.length + payments.length +
    documents.length + riskAssessments.length + idVerifications.length +
    pitchContent.length + teamsData.length + legacyEnquiries.length + newEnquiries.length;

  const summary = `Pipeline ${pipelineInput}: ${totalMatches} record(s) across ${
    [
      instructions.length && 'instructions',
      deals.length && 'deals',
      matters.length && 'matters',
      payments.length && 'payments',
      documents.length && 'documents',
      riskAssessments.length && 'risk',
      idVerifications.length && 'eid',
      pitchContent.length && 'pitch',
      teamsData.length && 'teams',
      (legacyEnquiries.length || newEnquiries.length) && 'enquiries',
    ].filter(Boolean).length
  } source(s)`;

  return {
    summary,
    warnings: pipelineWarnings,
    artefact: {
      kind: 'json',
      body: {
        type: 'pipeline',
        input: pipelineInput,
        scope: 'Core Data + Instructions',
        recordset: [{
          input: pipelineInput,
          keys: {
            instructionRefs: Array.from(instructionRefs),
            prospectIds: Array.from(prospectIds),
            passcodes: Array.from(passcodes),
            emails: Array.from(emails),
            dealIds: Array.from(dealIds),
            matterIds: Array.from(matterIds),
          },
          matches: {
            instructions, deals, matters, payments, documents,
            riskAssessments, idVerifications, pitchContent, teamsData,
            legacyEnquiries, newEnquiries,
          },
          warnings: pipelineWarnings,
        }],
      },
      downloadName: `pipeline-lookup-${safeFragment(pipelineInput)}.json`,
      mimeType: 'application/json',
      attachableTo: ['blob', 'asana'],
    },
  };
}

registerAction({
  id: 'pipeline-lookup',
  title: 'Pipeline lookup',
  description: 'Resolve a full Helix pipeline graph (enquiries → deals → instructions → matters → payments → docs → risk → EID → pitch → Teams) for an InstructionRef, ProspectId, passcode, email, or person name. Read-only.',
  category: 'lookup',
  allowedTiers: ['admin'],
  dryRunSupported: false,
  paramsSchema: [
    {
      key: 'query',
      label: 'InstructionRef / ProspectId / Passcode / Email / Person',
      type: 'text',
      required: true,
      placeholder: 'e.g. HLX-30038-73942 or 30038 or jane@example.com',
      helpText: 'Two-word names trigger strict full-name matching.',
      maxLength: 200,
      redactValue: false,
    },
  ],
  run: runPipelineLookup,
});

module.exports = { runPipelineLookup };
