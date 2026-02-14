#!/usr/bin/env node
import { config } from 'dotenv';
import sql from 'mssql';
import { createRequire } from 'module';

config();

const require = createRequire(import.meta.url);
const { getSecret } = require('../server/utils/getSecret.js');

const DEFAULT_BASE_URL = 'https://link-hub-v1-fehchxeqgxe9bsha.uksouth-01.azurewebsites.net';
const KEY_VAULT_TIMEOUT_MS = 4000;

const usage = `
Usage:
  node tools/run-matter-oneoff.mjs <instructionRef> <initials> [options]

Example:
  node tools/run-matter-oneoff.mjs HLX-30038-73942 RCH --fee-earner "Ryan Choi" --originating "Ryan Choi" --supervising "Alex"

Options:
  --base-url <url>         API host (default: production app)
  --fee-earner <name>      Fee earner full name (fallback: initials)
  --originating <name>     Originating solicitor full name (fallback: fee earner)
  --supervising <name>     Supervising partner (fallback: "Alex")
  --practice-area <value>  Practice area override
  --description <value>    Matter description override
  --source <value>         Source override
  --dry-run                Build payload and print only; do not call endpoints
`;

function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    if (token === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    const key = token.replace(/^--/, '');
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`);
    }
    options[key] = value;
    i += 1;
  }
  return { positional, options };
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

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms))
  ]);

const isRedacted = (value) => typeof value === 'string' && value.includes('<REDACTED>');

async function buildConnectionString({ server, database, user, secretName }) {
  const password = await withTimeout(getSecret(secretName), KEY_VAULT_TIMEOUT_MS, `Key Vault lookup for ${secretName}`);
  return `Server=tcp:${server},1433;Initial Catalog=${database};Persist Security Info=False;User ID=${user};Password=${password};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;`;
}

async function resolveInstructionsConnectionString() {
  const instructionsConn = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (instructionsConn && !isRedacted(instructionsConn)) return instructionsConn;

  const server = process.env.INSTRUCTIONS_SQL_SERVER || 'instructions.database.windows.net';
  const database = process.env.INSTRUCTIONS_SQL_DATABASE || 'instructions';
  const user = process.env.INSTRUCTIONS_SQL_USER || 'instructionsadmin';
  const secretName = process.env.INSTRUCTIONS_SQL_PASSWORD_SECRET_NAME || 'instructions-sql-password';

  return buildConnectionString({ server, database, user, secretName });
}

async function request(baseUrl, path, options = {}) {
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

  if (!res.ok) {
    throw new Error(`${method} ${path} failed (${res.status}): ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }

  return body;
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

function buildFormData(instruction, deal, instructionRef, prospectId, initials, options) {
  const feeEarner = options['fee-earner'] || initials;
  const originating = options.originating || feeEarner;
  const supervising = options.supervising || 'Alex';
  const description = options.description || deal?.ServiceDescription || instruction?.Claim || 'Advice on claim';
  const practiceArea = options['practice-area'] || deal?.AreaOfWork || 'General';
  const source = options.source || deal?.Source || deal?.source || 'unknown';

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
      budget_notify_users: []
    },
    team_assignments: {
      fee_earner: feeEarner,
      supervising_partner: supervising,
      originating_solicitor: originating,
      requesting_user: '',
      fee_earner_initials: initials,
      fee_earner_email: instruction?.HelixContact ? `${String(instruction.HelixContact).toLowerCase()}@helix-law.com` : '',
      originating_solicitor_initials: initials
    },
    client_information: [
      {
        poid_id: instructionRef,
        first_name: instruction?.FirstName || '',
        last_name: instruction?.LastName || '',
        email: instruction?.Email || '',
        best_number: instruction?.Phone || '',
        type: 'individual',
        nationality: instruction?.Nationality || 'United Kingdom',
        date_of_birth: instruction?.DOB || null,
        address: {
          house_number: instruction?.HouseNumber || null,
          street: instruction?.Street || null,
          city: instruction?.City || null,
          county: instruction?.County || null,
          post_code: instruction?.Postcode || null,
          country: instruction?.Country || 'United Kingdom'
        },
        company_details: null,
        verification: {
          check_result: null,
          pep_sanctions_result: null,
          address_verification_result: null
        }
      }
    ],
    source_details: {
      source,
      referrer_name: null
    },
    opponent_details: {
      opponent: null,
      solicitor: null
    },
    compliance: {
      conflict_check_completed: true,
      id_verification_required: true,
      pep_sanctions_check_required: true
    },
    metadata: {
      created_by: initials,
      created_at: new Date().toISOString(),
      form_version: 'oneoff-tool-v1',
      processing_status: 'pending_review'
    },
    instruction_summary: {
      payment_result: null,
      payment_amount: deal?.Amount || null,
      payment_timestamp: null,
      eid_overall_result: null,
      eid_check_id: null,
      eid_status: null,
      pep_sanctions_result: null,
      address_verification_result: null,
      risk_assessment: null,
      document_count: 0,
      documents: [],
      deal_id: deal?.DealId || null,
      service_description: deal?.ServiceDescription || description
    }
  };
}

async function getInstructionAndDeal(pool, instructionRef, prospectId) {
  const instructionResult = await pool
    .request()
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

  const dealResult = await pool
    .request()
    .input('instructionRef', sql.NVarChar(100), instructionRef)
    .input('prospectId', sql.NVarChar(100), String(prospectId || instruction.ProspectId || ''))
    .query(`
      SELECT TOP 1 *
      FROM Deals
      WHERE InstructionRef = @instructionRef OR ProspectId = @prospectId
      ORDER BY DealId DESC
    `);

  return {
    instruction,
    deal: dealResult.recordset?.[0] || null
  };
}

async function run() {
  const { positional, options } = parseArgs(process.argv.slice(2));
  if (positional.length < 2) {
    console.log(usage.trim());
    process.exit(1);
  }

  const parsedRef = parseInstructionRef(positional[0]);
  if (!parsedRef) {
    throw new Error('Instruction ref must look like HLX-12345-67890');
  }

  const initials = String(positional[1] || '').trim().toUpperCase();
  if (!initials) {
    throw new Error('Initials are required (second positional arg)');
  }

  const baseUrl = options['base-url'] || DEFAULT_BASE_URL;
  const connectionString = await resolveInstructionsConnectionString();

  const pool = await sql.connect(connectionString);
  try {
    const { instruction, deal } = await getInstructionAndDeal(pool, parsedRef.instructionRef, parsedRef.prospectId);
    const formData = buildFormData(instruction, deal, parsedRef.instructionRef, parsedRef.prospectId, initials, options);

    if (options.dryRun) {
      console.log(JSON.stringify({ instructionRef: parsedRef.instructionRef, initials, baseUrl, formData }, null, 2));
      return;
    }

    console.log(`--- Matter one-off replay: ${parsedRef.instructionRef} ---`);

    const opponentsPayload = {
      opponent: formData.opponent_details?.opponent || null,
      solicitor: formData.opponent_details?.solicitor || null,
      createdBy: initials
    };

    const opponents = await request(baseUrl, '/api/opponents', {
      method: 'POST',
      body: JSON.stringify(opponentsPayload)
    });
    const opponentId = opponents?.opponentId || null;
    const solicitorId = opponents?.solicitorId || null;
    console.log('✓ Opponents synced', { opponentId, solicitorId });

    const matterRequest = await request(baseUrl, '/api/matter-requests', {
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
        createdBy: initials
      })
    });

    const matterRequestId = matterRequest?.matterId || null;
    console.log('✓ Matter request created', { matterRequestId });

    const contacts = await request(baseUrl, '/api/clio-contacts', {
      method: 'POST',
      body: JSON.stringify({ formData, initials })
    });
    if (!contacts?.ok) throw new Error(`Clio contacts failed: ${contacts?.error || 'Unknown error'}`);

    const results = Array.isArray(contacts?.results) ? contacts.results : [];
    const contactIds = results.map((r) => String(r?.data?.id || '')).filter(Boolean);
    const company = results.find((r) => r?.data?.type === 'Company');
    const companyId = company?.data?.id ? String(company.data.id) : null;
    console.log('✓ Clio contacts synced', { contactIds, companyId });

    const clioMatter = await request(baseUrl, '/api/clio-matters', {
      method: 'POST',
      body: JSON.stringify({ formData, initials, contactIds, companyId })
    });
    if (!clioMatter?.ok) throw new Error(`Clio matter failed: ${clioMatter?.error || 'Unknown error'}`);

    const newMatterId = String(clioMatter?.matterId || clioMatter?.matter?.id || '');
    const displayNumber = clioMatter?.matter?.display_number || clioMatter?.matter?.displayNumber || null;
    if (!newMatterId) throw new Error('Clio matter response missing matter id');
    console.log('✓ Clio matter opened', { newMatterId, displayNumber });

    const leadClientId = contactIds[0] || null;
    if (!leadClientId) throw new Error('No lead client id available for instruction sync');

    const linkResp = await request(baseUrl, '/api/sync-instruction-client/link-client', {
      method: 'POST',
      body: JSON.stringify({
        instructionRef: formData.matter_details.instruction_ref,
        clientId: leadClientId,
        matterId: newMatterId
      })
    });
    console.log('✓ Instruction/client linked', linkResp);

    if (matterRequestId) {
      const patchResp = await request(baseUrl, `/api/matter-requests/${encodeURIComponent(matterRequestId)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          instructionRef: formData.matter_details.instruction_ref,
          clientId: leadClientId,
          displayNumber,
          clioMatterId: newMatterId
        })
      });
      console.log('✓ Matter request patched', patchResp);
    }

    console.log('--- DONE ---');
    console.log(JSON.stringify({
      instructionRef: formData.matter_details.instruction_ref,
      matterRequestId,
      clientId: leadClientId,
      matterId: newMatterId,
      displayNumber
    }, null, 2));
  } finally {
    await pool.close();
  }
}

run().catch((error) => {
  console.error('One-off replay failed:', error.message);
  process.exit(1);
});
