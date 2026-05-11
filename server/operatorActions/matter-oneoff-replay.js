// server/operatorActions/matter-oneoff-replay.js
//
// Operator action: replay the matter-opening pipeline for one InstructionRef.
// Mirrors `tools/run-matter-oneoff.mjs` but runs server-side via HTTP
// loopback to this same Express app, so it automatically hits whichever
// environment the user is in (staging app → staging endpoints, prod app →
// prod endpoints, local dev → localhost endpoints).
//
// THIS IS A WRITE ACTION. Guards:
//   - allowedTiers: ['dev']  (LZ only — AC was previously here but is now
//     plain admin; promote with care if you need to widen this gate)
//   - dryRunSupported: true  (default ON in the panel)
//   - confirmationPhrase 'REPLAY MATTER' required for live runs
//   - per-step App Insights events including a 'Refused' branch (handled by
//     the registry rejection path)

const sql = require('mssql');
const { registerAction } = require('./registry');
const { trackEvent } = require('../utils/appInsights');

const CONFIRMATION_PHRASE = 'REPLAY MATTER';

function safeFragment(value) {
  return String(value || 'replay')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'replay';
}

function parseInstructionRef(raw) {
  const value = String(raw || '').trim();
  const match = value.match(/^(?:[A-Z]+-?)?(\d+)-(\d+)$/i);
  if (!match) return null;
  const prospectId = match[1];
  const passcode = match[2];
  return {
    instructionRef: /^HLX-/i.test(value) ? value.toUpperCase() : `HLX-${prospectId}-${passcode}`,
    prospectId,
    passcode,
  };
}

function titleCase(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function resolveLoopbackBase() {
  // In Azure App Service, WEBSITE_HOSTNAME is the public host for this app.
  // Locally, fall back to PORT (server/index.js default 8080).
  if (process.env.WEBSITE_HOSTNAME) {
    return `https://${process.env.WEBSITE_HOSTNAME}`;
  }
  const port = process.env.PORT || process.env.SERVER_PORT || '8080';
  return `http://localhost:${port}`;
}

async function loopbackRequest(baseUrl, path, options = {}) {
  const url = `${baseUrl}${path}`;
  const method = options.method || 'GET';
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, { ...options, method, headers });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, ok: res.ok, body };
}

async function getInstructionAndDeal(pool, instructionRef, prospectId) {
  const instructionResult = await pool.request()
    .input('instructionRef', sql.NVarChar(100), instructionRef)
    .query(`
      SELECT TOP 1 *
      FROM Instructions
      WHERE InstructionRef = @instructionRef
      ORDER BY LastUpdated DESC
    `);
  const instruction = instructionResult.recordset?.[0] || null;
  if (!instruction) {
    throw new Error(`Instruction not found: ${instructionRef}`);
  }

  const dealResult = await pool.request()
    .input('instructionRef', sql.NVarChar(100), instructionRef)
    .input('prospectId', sql.NVarChar(100), String(prospectId || instruction.ProspectId || ''))
    .query(`
      SELECT TOP 1 *
      FROM Deals
      WHERE InstructionRef = @instructionRef OR ProspectId = @prospectId
      ORDER BY DealId DESC
    `);

  const idvResult = await pool.request()
    .input('instructionRef2', sql.NVarChar(100), instructionRef)
    .query(`
      SELECT TOP 1 *
      FROM IdVerifications
      WHERE InstructionRef = @instructionRef2
      ORDER BY InternalId DESC
    `);

  return {
    instruction,
    deal: dealResult.recordset?.[0] || null,
    idVerification: idvResult.recordset?.[0] || null,
  };
}

function buildFormData(instruction, deal, instructionRef, prospectId, initials, opts, idVerification) {
  const feeEarner = opts.feeEarner || initials;
  const originating = opts.originatingSolicitor || feeEarner;
  const supervising = opts.supervisingPartner || 'Alex';
  const description = opts.description || deal?.ServiceDescription || instruction?.Claim || 'Advice on claim';
  const practiceArea = opts.practiceArea || deal?.AreaOfWork || 'General';
  const source = opts.source || deal?.Source || deal?.source || 'unknown';

  return {
    matter_details: {
      instruction_ref: instructionRef,
      client_id: String(instruction?.ProspectId || prospectId || ''),
      matter_ref: null,
      stage: instruction?.Stage || 'proof-of-id-complete',
      date_created: new Date().toISOString().slice(0, 10),
      client_type: instruction?.ClientType || 'Individual',
      area_of_work: titleCase(deal?.AreaOfWork || ''),
      practice_area: practiceArea,
      description,
      client_as_on_file: null,
      dispute_value: instruction?.ApproxValue || '£10k - £500k',
      folder_structure: 'Default',
      budget_required: 'No',
      budget_amount: null,
      budget_notify_threshold: null,
      budget_notify_users: [],
    },
    team_assignments: {
      fee_earner: feeEarner,
      supervising_partner: supervising,
      originating_solicitor: originating,
      requesting_user: '',
      fee_earner_initials: initials,
      fee_earner_email: instruction?.HelixContact ? `${String(instruction.HelixContact).toLowerCase()}@helix-law.com` : '',
      originating_solicitor_initials: initials,
    },
    client_information: [
      {
        poid_id: instructionRef,
        first_name: instruction?.FirstName || '',
        last_name: instruction?.LastName || '',
        email: instruction?.Email || '',
        best_number: instruction?.Phone || '',
        type: (instruction?.ClientType || 'Individual').toLowerCase() === 'company' ? 'company' : 'individual',
        nationality: instruction?.Nationality || 'United Kingdom',
        date_of_birth: instruction?.DOB || null,
        address: {
          house_number: instruction?.HouseNumber || null,
          street: instruction?.Street || null,
          city: instruction?.City || null,
          county: instruction?.County || null,
          post_code: instruction?.Postcode || null,
          country: instruction?.Country || 'United Kingdom',
        },
        company_details: (instruction?.ClientType || 'Individual').toLowerCase() === 'company' && instruction?.CompanyName
          ? {
              name: instruction.CompanyName,
              number: instruction.CompanyNumber || null,
              phone: instruction.Phone || null,
              address: {
                house_number: instruction.CompanyHouseNumber || null,
                street: instruction.CompanyStreet || null,
                city: instruction.CompanyCity || null,
                county: instruction.CompanyCounty || null,
                post_code: instruction.CompanyPostcode || null,
                country: instruction.CompanyCountry || 'United Kingdom',
              },
            }
          : null,
        verification: {
          check_result: idVerification?.IdType || instruction?.IdType || null,
          check_id: idVerification?.EIDCheckId || null,
          check_expiry: idVerification?.CheckExpiry || null,
          pep_sanctions_result: idVerification?.PEPAndSanctionsCheckResult || null,
          address_verification_result: idVerification?.AddressVerificationResult || null,
        },
      },
    ],
    source_details: { source, referrer_name: null },
    opponent_details: { opponent: null, solicitor: null },
    compliance: {
      conflict_check_completed: true,
      id_verification_required: true,
      pep_sanctions_check_required: true,
    },
    metadata: {
      created_by: initials,
      created_at: new Date().toISOString(),
      form_version: 'oneoff-action-v1',
      processing_status: 'pending_review',
    },
    instruction_summary: {
      payment_result: null,
      payment_amount: deal?.Amount || null,
      payment_timestamp: null,
      eid_overall_result: idVerification?.EIDOverallResult || null,
      eid_check_id: idVerification?.EIDCheckId || null,
      eid_status: idVerification?.EIDStatus || null,
      pep_sanctions_result: idVerification?.PEPAndSanctionsCheckResult || null,
      address_verification_result: idVerification?.AddressVerificationResult || null,
      risk_assessment: null,
      document_count: 0,
      documents: [],
      deal_id: deal?.DealId || null,
      service_description: deal?.ServiceDescription || description,
    },
  };
}

async function runMatterReplayLive(baseUrl, formData, initials) {
  const steps = [];

  // 1. opponents
  const opponentsRes = await loopbackRequest(baseUrl, '/api/opponents', {
    method: 'POST',
    body: JSON.stringify({
      opponent: formData.opponent_details?.opponent || null,
      solicitor: formData.opponent_details?.solicitor || null,
      createdBy: initials,
    }),
  });
  steps.push({ step: 'opponents', status: opponentsRes.status, body: opponentsRes.body });
  if (!opponentsRes.ok) throw new Error(`opponents failed: HTTP ${opponentsRes.status}`);
  const opponentId = opponentsRes.body?.opponentId || null;
  const solicitorId = opponentsRes.body?.solicitorId || null;

  // 2. matter-requests
  const mrRes = await loopbackRequest(baseUrl, '/api/matter-requests', {
    method: 'POST',
    body: JSON.stringify({
      instructionRef: formData.matter_details?.instruction_ref || null,
      clientType: formData.matter_details?.client_type || null,
      description: formData.matter_details?.description || null,
      practiceArea: formData.matter_details?.practice_area || null,
      value: formData.matter_details?.dispute_value || null,
      budgetRequired: formData.matter_details?.budget_required || null,
      budgetAmount: formData.matter_details?.budget_amount || null,
      budgetNotifyThreshold: formData.matter_details?.budget_notify_threshold || null,
      budgetNotifyUsers: formData.matter_details?.budget_notify_users || null,
      responsibleSolicitor: formData.team_assignments?.fee_earner || null,
      originatingSolicitor: formData.team_assignments?.originating_solicitor || null,
      supervisingPartner: formData.team_assignments?.supervising_partner || null,
      source: formData.source_details?.source || null,
      referrer: formData.source_details?.referrer_name || null,
      opponentId,
      solicitorId,
      createdBy: initials,
    }),
  });
  steps.push({ step: 'matter-requests', status: mrRes.status, body: mrRes.body });
  if (!mrRes.ok) throw new Error(`matter-requests failed: HTTP ${mrRes.status}`);
  const matterRequestId = mrRes.body?.matterId || null;

  // 3. clio-contacts
  const ccRes = await loopbackRequest(baseUrl, '/api/clio-contacts', {
    method: 'POST',
    body: JSON.stringify({ formData, initials }),
  });
  steps.push({ step: 'clio-contacts', status: ccRes.status, body: ccRes.body });
  if (!ccRes.ok || !ccRes.body?.ok) throw new Error(`clio-contacts failed: ${ccRes.body?.error || `HTTP ${ccRes.status}`}`);
  const results = Array.isArray(ccRes.body?.results) ? ccRes.body.results : [];
  const contactIds = results.map((r) => String(r?.data?.id || '')).filter(Boolean);
  const company = results.find((r) => r?.data?.type === 'Company');
  const companyId = company?.data?.id ? String(company.data.id) : null;

  // 4. clio-matters
  const cmRes = await loopbackRequest(baseUrl, '/api/clio-matters', {
    method: 'POST',
    body: JSON.stringify({ formData, initials, contactIds, companyId }),
  });
  steps.push({ step: 'clio-matters', status: cmRes.status, body: cmRes.body });
  if (!cmRes.ok || !cmRes.body?.ok) throw new Error(`clio-matters failed: ${cmRes.body?.error || `HTTP ${cmRes.status}`}`);
  const newMatterId = String(cmRes.body?.matterId || cmRes.body?.matter?.id || '');
  const displayNumber = cmRes.body?.matter?.display_number || cmRes.body?.matter?.displayNumber || null;
  if (!newMatterId) throw new Error('Clio matter response missing matter id');

  // 5. link instruction → client → matter
  const leadClientId = contactIds[0] || null;
  if (!leadClientId) throw new Error('No lead client id available for instruction sync');
  const linkRes = await loopbackRequest(baseUrl, '/api/sync-instruction-client/link-client', {
    method: 'POST',
    body: JSON.stringify({
      instructionRef: formData.matter_details.instruction_ref,
      clientId: leadClientId,
      matterId: newMatterId,
    }),
  });
  steps.push({ step: 'link-client', status: linkRes.status, body: linkRes.body });

  // 6. patch matter-request with final ids
  if (matterRequestId) {
    const patchRes = await loopbackRequest(baseUrl, `/api/matter-requests/${encodeURIComponent(matterRequestId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        instructionRef: formData.matter_details.instruction_ref,
        clientId: leadClientId,
        displayNumber,
        clioMatterId: newMatterId,
      }),
    });
    steps.push({ step: 'matter-requests-patch', status: patchRes.status, body: patchRes.body });
  }

  return { matterRequestId, contactIds, companyId, leadClientId, newMatterId, displayNumber, steps };
}

async function runMatterOneoffReplay({ params, dryRun, requestor }) {
  const parsedRef = parseInstructionRef(params.instructionRef);
  if (!parsedRef) {
    return {
      summary: 'Invalid InstructionRef',
      artefact: null,
      warnings: ['InstructionRef must look like HLX-12345-67890'],
    };
  }

  const initials = String(params.feeEarnerInitials || '').trim().toUpperCase();
  if (!initials) {
    return { summary: 'Initials required', artefact: null, warnings: ['feeEarnerInitials required'] };
  }

  const baseUrl = resolveLoopbackBase();
  const env = process.env.WEBSITE_HOSTNAME ? 'azure' : 'local';

  const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!connStr) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not configured');
  const pool = await sql.connect(connStr);

  const { instruction, deal, idVerification } = await getInstructionAndDeal(
    pool, parsedRef.instructionRef, parsedRef.prospectId,
  );

  const opts = {
    feeEarner: params.feeEarner,
    originatingSolicitor: params.originatingSolicitor,
    supervisingPartner: params.supervisingPartner,
    practiceArea: params.practiceAreaOverride,
    description: params.descriptionOverride,
    source: params.sourceOverride,
  };

  const formData = buildFormData(
    instruction, deal, parsedRef.instructionRef, parsedRef.prospectId,
    initials, opts, idVerification,
  );

  if (dryRun) {
    trackEvent('OperatorActions.Run.MatterReplay.Dry', {
      actionId: 'matter-oneoff-replay',
      instructionRef: parsedRef.instructionRef,
      requestor: requestor?.initials || '',
      env,
    });
    return {
      summary: `Dry run — payload built for ${parsedRef.instructionRef} (${initials})`,
      artefact: {
        kind: 'json',
        body: {
          type: 'matter-oneoff-replay',
          mode: 'dry',
          input: { instructionRef: parsedRef.instructionRef, initials },
          target: { baseUrl, env },
          formData,
        },
        downloadName: `matter-replay-dry-${safeFragment(parsedRef.instructionRef)}.json`,
        mimeType: 'application/json',
        attachableTo: ['blob', 'asana'],
      },
    };
  }

  trackEvent('OperatorActions.Run.MatterReplay.Live', {
    actionId: 'matter-oneoff-replay',
    instructionRef: parsedRef.instructionRef,
    requestor: requestor?.initials || '',
    env,
  });

  const liveResult = await runMatterReplayLive(baseUrl, formData, initials);

  const summary = `Live replay OK — ${parsedRef.instructionRef} → matter ${liveResult.displayNumber || liveResult.newMatterId}`;

  return {
    summary,
    artefact: {
      kind: 'json',
      body: {
        type: 'matter-oneoff-replay',
        mode: 'live',
        input: { instructionRef: parsedRef.instructionRef, initials },
        target: { baseUrl, env },
        result: liveResult,
        formData,
      },
      downloadName: `matter-replay-live-${safeFragment(parsedRef.instructionRef)}.json`,
      mimeType: 'application/json',
      attachableTo: ['blob', 'asana'],
    },
  };
}

registerAction({
  id: 'matter-oneoff-replay',
  title: 'Matter one-off replay',
  description: 'Re-run the matter-opening pipeline for one InstructionRef. WRITE action — requires confirmation phrase for live runs.',
  category: 'mutate',
  allowedTiers: ['dev'],
  dryRunSupported: true,
  paramsSchema: [
    {
      key: 'instructionRef',
      label: 'InstructionRef',
      type: 'text',
      required: true,
      placeholder: 'HLX-30038-73942',
      maxLength: 32,
      redactValue: false,
    },
    {
      key: 'feeEarnerInitials',
      label: 'Fee earner initials',
      type: 'text',
      required: true,
      placeholder: 'RCH',
      maxLength: 4,
      redactValue: false,
    },
    {
      key: 'feeEarner',
      label: 'Fee earner full name',
      type: 'text',
      required: false,
      placeholder: 'Ryan Choi',
      maxLength: 100,
      redactValue: false,
    },
    {
      key: 'originatingSolicitor',
      label: 'Originating solicitor',
      type: 'text',
      required: false,
      placeholder: 'Defaults to fee earner',
      maxLength: 100,
      redactValue: false,
    },
    {
      key: 'supervisingPartner',
      label: 'Supervising partner',
      type: 'text',
      required: false,
      placeholder: 'Alex',
      maxLength: 100,
      redactValue: false,
    },
    {
      key: 'practiceAreaOverride',
      label: 'Practice area override',
      type: 'text',
      required: false,
      maxLength: 100,
      redactValue: false,
    },
    {
      key: 'descriptionOverride',
      label: 'Matter description override',
      type: 'text',
      required: false,
      maxLength: 500,
      redactValue: false,
    },
    {
      key: 'sourceOverride',
      label: 'Source override',
      type: 'text',
      required: false,
      maxLength: 100,
      redactValue: false,
    },
    {
      key: 'confirmationPhrase',
      label: 'Confirmation phrase',
      type: 'confirmation',
      required: true,
      expectedPhrase: CONFIRMATION_PHRASE,
      placeholder: `Type ${CONFIRMATION_PHRASE} to confirm`,
      helpText: `Required for live runs. Type ${CONFIRMATION_PHRASE} exactly.`,
    },
  ],
  run: runMatterOneoffReplay,
});

module.exports = { runMatterOneoffReplay, CONFIRMATION_PHRASE };
