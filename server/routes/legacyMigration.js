/**
 * Legacy Pipeline Migration  –  /api/migration
 *
 * POST /discover   – search Core Data + Instructions DB, return what exists
 * POST /execute    – create missing pipeline records (enquiry → deal → instruction → matters → idVerification)
 *
 * Designed for matters opened via the old route (directly in Clio, bypassing the enquiry pipeline).
 *
 * Column names verified against:
 *   - server/routes/dealCapture.js        (Deals INSERT — production)
 *   - server/routes/matterRequests.js     (Matters INSERT — production)
 *   - server/routes/matter-operations.js  (Matters INSERT — production)
 *   - scripts/temp-migrate-bizcap.mjs     (All tables — verified working 2026-02-18)
 */

const express = require('express');
const router = express.Router();
const { withRequest, sql } = require('../utils/db');
const { trackEvent, trackException } = require('../utils/appInsights');

function splitInstructionRef(ref) {
  const match = String(ref || '').match(/^HLX-(\d+)-(\d+)$/i);
  if (!match) return null;
  return { prospectId: Number(match[1]), passcode: Number(match[2]) };
}

function parsePositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function parseCsvIds(value) {
  return String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

function mergeCsvIds(...values) {
  const merged = new Set(values.flatMap(parseCsvIds));
  return Array.from(merged).join(',');
}

/* ────────────────────────────────────────────────────────────────────
 *  POST /api/migration/discover
 *  Body: { query: string }
 *  Smart search: auto-detects display number, email, or name
 * ──────────────────────────────────────────────────────────────────── */
router.post('/discover', async (req, res) => {
  const { query } = req.body;
  if (!query || !query.trim()) return res.status(400).json({ error: 'query is required' });

  const q = query.trim();
  const userDisplay = req.user ? `${req.user.initials} (${req.user.fullName})` : 'Unknown';
  console.log(`[Migration][discover] User ${userDisplay} searching: "${q}"`);

  const coreConn = process.env.SQL_CONNECTION_STRING;
  const instrConn = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!coreConn) return res.status(500).json({ error: 'SQL_CONNECTION_STRING not configured' });
  if (!instrConn) return res.status(500).json({ error: 'INSTRUCTIONS_SQL_CONNECTION_STRING not configured' });

  try {
    // Detect search type
    const isDisplayNumber = /^[A-Z]{2,}[\d-]+/i.test(q);
    const isEmail = q.includes('@');

    // ── Core Data: matters ──
    const matters = await withRequest(coreConn, async (request) => {
      if (isDisplayNumber) {
        request.input('q', sql.NVarChar, `%${q}%`);
        return (await request.query(`SELECT * FROM matters WHERE [Display Number] LIKE @q`)).recordset;
      } else if (isEmail) {
        return []; // No email in matters table
      } else {
        request.input('q', sql.NVarChar, `%${q}%`);
        return (await request.query(`SELECT * FROM matters WHERE [Client Name] LIKE @q`)).recordset;
      }
    });

    // ── Core Data: POID ──
    const poid = await withRequest(coreConn, async (request) => {
      if (isDisplayNumber && matters.length > 0) {
        const clioMatterId = matters[0]['Unique ID'];
        if (clioMatterId) {
          request.input('mid', sql.NVarChar, String(clioMatterId));
          return (await request.query(`SELECT * FROM poid WHERE matter_id = @mid`)).recordset;
        }
      }
      if (isEmail) {
        request.input('email', sql.NVarChar, q);
        return (await request.query(`SELECT * FROM poid WHERE email = @email`)).recordset;
      }
      const parts = q.split(/\s+/);
      if (parts.length >= 2) {
        request.input('first', sql.NVarChar, `%${parts[0]}%`);
        request.input('last', sql.NVarChar, `%${parts[parts.length - 1]}%`);
        return (await request.query(`SELECT * FROM poid WHERE first LIKE @first AND last LIKE @last`)).recordset;
      }
      request.input('q', sql.NVarChar, `%${q}%`);
      return (await request.query(`SELECT * FROM poid WHERE first LIKE @q OR last LIKE @q OR company_name LIKE @q`)).recordset;
    });

    // ── Core Data: enquiries ──
    const enquiries = await withRequest(coreConn, async (request) => {
      if (isEmail) {
        request.input('email', sql.NVarChar, q);
        return (await request.query(`SELECT * FROM enquiries WHERE Email = @email`)).recordset;
      }
      if (isDisplayNumber && matters.length > 0) {
        const clientName = matters[0]['Client Name'];
        if (clientName) {
          request.input('company', sql.NVarChar, `%${clientName}%`);
          return (await request.query(`SELECT TOP 5 * FROM enquiries WHERE Company LIKE @company ORDER BY ID DESC`)).recordset;
        }
      }
      const parts = q.split(/\s+/);
      if (parts.length >= 2) {
        request.input('first', sql.NVarChar, `%${parts[0]}%`);
        request.input('last', sql.NVarChar, `%${parts[parts.length - 1]}%`);
        return (await request.query(`SELECT TOP 5 * FROM enquiries WHERE First_Name LIKE @first AND Last_Name LIKE @last ORDER BY ID DESC`)).recordset;
      }
      request.input('q', sql.NVarChar, `%${q}%`);
      return (await request.query(`SELECT TOP 5 * FROM enquiries WHERE First_Name LIKE @q OR Last_Name LIKE @q OR Company LIKE @q OR Email LIKE @q ORDER BY ID DESC`)).recordset;
    });

    // ── Instructions DB: enquiries (new space) ──
    const newSpaceEnquiries = await withRequest(instrConn, async (request) => {
      if (isEmail) {
        request.input('email', sql.NVarChar, q);
        return (await request.query(`SELECT * FROM dbo.enquiries WHERE email = @email ORDER BY datetime DESC`)).recordset;
      }
      // If we found a POID with acid, look up by acid
      if (poid.length > 0 && poid[0].acid) {
        request.input('acid', sql.NVarChar, String(poid[0].acid));
        return (await request.query(`SELECT * FROM dbo.enquiries WHERE acid = @acid ORDER BY datetime DESC`)).recordset;
      }
      const parts = q.split(/\s+/);
      if (parts.length >= 2) {
        request.input('first', sql.NVarChar, `%${parts[0]}%`);
        request.input('last', sql.NVarChar, `%${parts[parts.length - 1]}%`);
        return (await request.query(`SELECT TOP 5 * FROM dbo.enquiries WHERE first LIKE @first AND last LIKE @last ORDER BY datetime DESC`)).recordset;
      }
      request.input('q', sql.NVarChar, `%${q}%`);
      return (await request.query(`SELECT TOP 5 * FROM dbo.enquiries WHERE first LIKE @q OR last LIKE @q OR email LIKE @q ORDER BY datetime DESC`)).recordset;
    });

    // ── Instructions DB: Instructions ──
    const instructions = await withRequest(instrConn, async (request) => {
      if (isEmail) {
        request.input('email', sql.NVarChar, q);
        return (await request.query(`SELECT * FROM Instructions WHERE Email = @email`)).recordset;
      }
      if (matters.length > 0) {
        const clientId = matters[0]['Client ID'];
        if (clientId) {
          request.input('clientId', sql.NVarChar, String(clientId));
          return (await request.query(`SELECT * FROM Instructions WHERE ClientId = @clientId`)).recordset;
        }
      }
      request.input('q', sql.NVarChar, `%${q}%`);
      return (await request.query(`SELECT TOP 100 * FROM Instructions WHERE FirstName LIKE @q OR LastName LIKE @q OR CompanyName LIKE @q`)).recordset;
    });

    // ── Instructions DB: Deals ──
    const deals = await withRequest(instrConn, async (request) => {
      if (instructions.length > 0) {
        const refs = instructions.map(i => i.InstructionRef).filter(Boolean);
        if (refs.length > 0) {
          request.input('ref', sql.NVarChar, refs[0]);
          return (await request.query(`SELECT * FROM Deals WHERE InstructionRef = @ref`)).recordset;
        }
      }
      return [];
    });

    // ── Instructions DB: Matters ──
    const instrMatters = await withRequest(instrConn, async (request) => {
      if (instructions.length > 0) {
        const refs = instructions.map(i => i.InstructionRef).filter(Boolean);
        if (refs.length > 0) {
          request.input('ref', sql.NVarChar, refs[0]);
          return (await request.query(`SELECT * FROM Matters WHERE InstructionRef = @ref`)).recordset;
        }
      }
      if (matters.length > 0) {
        const clioMatterId = matters[0]['Unique ID'];
        if (clioMatterId) {
          request.input('mid', sql.NVarChar, String(clioMatterId));
          return (await request.query(`SELECT * FROM Matters WHERE MatterID = @mid`)).recordset;
        }
      }
      return [];
    });

    // ── Instructions DB: IdVerifications ──
    const idVerifications = await withRequest(instrConn, async (request) => {
      if (instructions.length > 0) {
        const ref = instructions[0].InstructionRef;
        if (ref) {
          request.input('ref', sql.NVarChar, ref);
          return (await request.query(`SELECT * FROM IdVerifications WHERE InstructionRef = @ref`)).recordset;
        }
      }
      if (poid.length > 0 && poid[0].email) {
        request.input('email', sql.NVarChar, poid[0].email);
        return (await request.query(`SELECT * FROM IdVerifications WHERE ClientEmail = @email`)).recordset;
      }
      return [];
    });

    // ── Instructions DB: Payments ──
    const payments = await withRequest(instrConn, async (request) => {
      if (instructions.length > 0) {
        const ref = instructions[0].InstructionRef;
        if (ref) {
          request.input('ref', sql.NVarChar, ref);
          return (await request.query(`SELECT * FROM Payments WHERE instruction_ref = @ref ORDER BY created_at DESC`)).recordset;
        }
      }
      if (isEmail) {
        request.input('email', sql.NVarChar, q);
        return (await request.query(`
          SELECT p.*
          FROM Payments p
          INNER JOIN Instructions i ON i.InstructionRef = p.instruction_ref
          WHERE i.Email = @email
          ORDER BY p.created_at DESC
        `)).recordset;
      }
      return [];
    });

    const result = {
      query: q,
      searchType: isDisplayNumber ? 'display-number' : isEmail ? 'email' : 'name',
      systems: {
        'Core Data': {
          matters: { found: matters.length > 0, count: matters.length, data: matters },
          poid: { found: poid.length > 0, count: poid.length, data: poid },
          enquiries: { found: enquiries.length > 0, count: enquiries.length, data: enquiries },
        },
        'Instructions DB': {
          newSpaceEnquiries: { found: newSpaceEnquiries.length > 0, count: newSpaceEnquiries.length, data: newSpaceEnquiries },
          Instructions: { found: instructions.length > 0, count: instructions.length, data: instructions },
          Deals: { found: deals.length > 0, count: deals.length, data: deals },
          Matters: { found: instrMatters.length > 0, count: instrMatters.length, data: instrMatters },
          IdVerifications: { found: idVerifications.length > 0, count: idVerifications.length, data: idVerifications },
          Payments: { found: payments.length > 0, count: payments.length, data: payments },
        },
      },
      prefill: buildPrefill(matters, poid, enquiries),
    };

    trackEvent('Migration.Discover.Completed', {
      query: q,
      searchType: result.searchType,
      mattersFound: String(matters.length),
      poidFound: String(poid.length),
      enquiriesFound: String(enquiries.length),
      instructionsFound: String(instructions.length),
      newSpaceEnquiriesFound: String(newSpaceEnquiries.length),
      paymentsFound: String(payments.length),
      user: userDisplay,
    });

    res.json(result);
  } catch (err) {
    trackException(err, { operation: 'migration-discover', query: q });
    console.error('[Migration][discover] Error:', err.message);
    res.status(500).json({ error: 'Discovery failed', detail: err.message });
  }
});

/* ────────────────────────────────────────────────────────────────────
 *  Pre-fill helper: extracts intake fields from discovered data
 *  Sources: Core Data matters [m], POID [p], enquiries [e]
 * ──────────────────────────────────────────────────────────────────── */
function buildPrefill(matters, poid, enquiries) {
  const m = matters[0] || {};
  const p = poid[0] || {};
  const e = enquiries[0] || {};

  // Derive client type from matter client name
  const clientName = m['Client Name'] || '';
  const isCompany = /\b(ltd|limited|plc|llp|inc|corp)\b/i.test(clientName);

  // Map responsible solicitor to initials (canonical source: dbo.team table)
  const solToInitials = {
    'Alex Cook': 'AC', 'Samuel Packwood': 'SP', 'Ryan Choi': 'RCH',
    'Richard Chapman': 'RC', 'Fiona Wheeler': 'FW', 'Jonathan Waters': 'JW',
    'Laura Adams': 'LA', 'Imogen Lahiff': 'IL', 'Elias Shermet Vilola': 'EV',
    'Jack Hine': 'JWH', 'Cassie Shermet': 'CS', 'Zara Khan': 'ZK',
    'Luke Zavadsky': 'LZ',
  };
  const responsibleSolicitor = m['Responsible Solicitor'] || '';
  const feeEarnerInitials = solToInitials[responsibleSolicitor] || '';

  // Map practice area → area of work
  const practiceAreaToAow = (pa) => {
    if (!pa) return 'commercial';
    const lower = pa.toLowerCase();
    if (lower.includes('property') || lower.includes('landlord') || lower.includes('boundary') || lower.includes('tolata') || lower.includes('land law')) return 'property';
    if (lower.includes('employment')) return 'employment';
    if (lower.includes('construction')) return 'construction';
    return 'commercial';
  };

  return {
    firstName: p.first || e.First_Name || '',
    lastName: p.last || e.Last_Name || '',
    email: p.email || e.Email || '',
    phone: p.best_number || e.Phone_Number || '',
    prefix: p.prefix || '',
    dob: p.date_of_birth || '',
    isCompany,
    companyName: isCompany ? clientName : (p.company_name || e.Company || ''),
    companyNumber: p.company_number || '',
    address: {
      house: p.house_building_number || '',
      street: p.street || '',
      city: p.city || '',
      county: p.county || '',
      postCode: p.post_code || '',
      country: p.country || 'United Kingdom',
    },
    displayNumber: m['Display Number'] || '',
    description: m['Description'] || '',
    practiceArea: m['Practice Area'] || '',
    areaOfWork: practiceAreaToAow(m['Practice Area']),
    responsibleSolicitor,
    feeEarnerInitials,
    originatingSolicitor: m['Originating Solicitor'] || '',
    supervisingPartner: m['Supervising Partner'] || '',
    clioClientId: String(m['Client ID'] || ''),
    clioMatterId: String(m['Unique ID'] || ''),
    openDate: m['Open Date'] || '',
    value: m['Approx. Value'] || '',
    source: m['Source'] || '',
    poidId: p.poid_id || '',
    acid: p.acid || String(e.ID || ''),
    idCheckResult: p.check_result || '',
    idCheckId: p.check_id || '',
    nationality: p.nationality || '',
    passportNumber: p.passport_number || '',
    driversLicenseNumber: p.drivers_license_number || '',
    idDocsFolder: p.id_docs_folder || '',
    enquiryId: String(e.ID || ''),
    poc: p.poc || m['Responsible Solicitor'] || '',
    methodOfContact: e.Method_of_Contact || p.poc || '',
    clientName,
  };
}

/* ────────────────────────────────────────────────────────────────────
 *  POST /api/migration/execute
 *  Body: { prefill, intake, discovered }
 *  Creates missing pipeline records
 *
 *  Schema aligned with proven INSERT patterns from:
 *    dealCapture.js, matterRequests.js, matter-operations.js,
 *    temp-migrate-bizcap.mjs (all verified working)
 * ──────────────────────────────────────────────────────────────────── */
router.post('/execute', async (req, res) => {
  const { prefill, intake, discovered, modules = {}, moduleData = {} } = req.body;
  if (!prefill) return res.status(400).json({ error: 'prefill is required' });

  // Helper: get field value from moduleData, then intake, then fallback
  const mf = (mod, field, fallback = '') => (moduleData[mod] && moduleData[mod][field]) || fallback;

  const userDisplay = req.user ? `${req.user.initials} (${req.user.fullName})` : 'Unknown';
  console.log(`[Migration][execute] User ${userDisplay} executing for ${prefill.displayNumber || prefill.email}`);

  const coreConn = process.env.SQL_CONNECTION_STRING;
  const instrConn = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!coreConn || !instrConn) return res.status(500).json({ error: 'Database configuration missing' });

  const created = [];
  const errors = [];

  try {
    const discoveredInstructionRef = discovered?.instructions?.data?.[0]?.InstructionRef || '';
    const splitFromExisting = splitInstructionRef(discoveredInstructionRef);
    const fallbackProspect = parsePositiveInt(mf('newSpaceEnquiry', 'acid', prefill.acid || prefill.enquiryId || ''));
    const prospectId = splitFromExisting?.prospectId || fallbackProspect || Math.floor(10000 + Math.random() * 90000);
    const passcode = splitFromExisting?.passcode || Math.floor(10000 + Math.random() * 90000);
    const instructionRef = discoveredInstructionRef || `HLX-${prospectId}-${passcode}`;
    const now = new Date();
    const todayDate = now.toISOString().split('T')[0];
    const todayTime = now.toTimeString().split(' ')[0];

    trackEvent('Migration.Execute.Started', {
      instructionRef,
      displayNumber: prefill.displayNumber || '',
      user: userDisplay,
    });

    /* ── 1. Create Enquiry (Core Data) if missing ──
     *  Schema: enquiries (ID int, Date_Created, Email, Area_of_Work, ...)
     *  ID is not IDENTITY in Core Data — accepts explicit values (e.g. AC contact IDs)
     */
    const hasLegacyEnquiry = !!discovered?.enquiries?.found;
    const hasNewSpaceEnquiry = !!discovered?.newSpaceEnquiries?.found;
    if (modules.enquiry && !hasLegacyEnquiry) {
      try {
        await withRequest(coreConn, async (request) => {
          request.input('id', sql.Int, prospectId);
          request.input('dateCreated', sql.NVarChar, todayDate);
          request.input('touchpointDate', sql.NVarChar, todayDate);
          request.input('email', sql.NVarChar, mf('enquiry', 'email', prefill.email || ''));
          request.input('aow', sql.NVarChar, mf('enquiry', 'areaOfWork', intake?.areaOfWork || 'commercial'));
          request.input('poc', sql.NVarChar, mf('enquiry', 'poc', prefill.poc || ''));
          request.input('company', sql.NVarChar, mf('enquiry', 'company', prefill.companyName || null));
          request.input('firstName', sql.NVarChar, mf('enquiry', 'firstName', prefill.firstName || ''));
          request.input('lastName', sql.NVarChar, mf('enquiry', 'lastName', prefill.lastName || ''));
          request.input('phone', sql.NVarChar, mf('enquiry', 'phone', prefill.phone || ''));
          request.input('matterRef', sql.NVarChar, prefill.displayNumber || null);
          request.input('value', sql.NVarChar, prefill.value || null);
          request.input('source', sql.NVarChar, mf('enquiry', 'source', prefill.source || 'legacy migration'));
          request.input('notes', sql.NVarChar, `Migrated from legacy route. Original matter: ${prefill.displayNumber || 'unknown'}`);

          await request.query(`
            INSERT INTO enquiries (
              ID, Date_Created, Touchpoint_Date, Email, Area_of_Work,
              Point_of_Contact, Company, First_Name, Last_Name, Phone_Number,
              Matter_Ref, Value, Ultimate_Source, Initial_first_call_notes
            ) VALUES (
              @id, @dateCreated, @touchpointDate, @email, @aow,
              @poc, @company, @firstName, @lastName, @phone,
              @matterRef, @value, @source, @notes
            )
          `);
        });
        created.push({ type: 'enquiry', id: String(prospectId) });
      } catch (err) {
        errors.push({ type: 'enquiry', error: err.message });
      }
    } else {
      // Either module disabled or enquiry already exists
      const existingId = hasLegacyEnquiry
        ? String(discovered.enquiries.data?.[0]?.ID || 'existing-legacy')
        : 'skipped';
      created.push({ type: 'enquiry', id: existingId, existing: hasLegacyEnquiry, skipped: !modules.enquiry && !hasLegacyEnquiry });
    }

    /* ── 1b. Create Enquiry (New Space / Instructions DB) if missing ──
     *  Important: id is IDENTITY in dbo.enquiries. Never seed with legacy acid.
     *  Legacy identifier is stored in acid column.
     */
    if (modules.newSpaceEnquiry && !hasNewSpaceEnquiry) {
      try {
        const acidValue = String(mf('newSpaceEnquiry', 'acid', prefill.acid || prefill.enquiryId || prospectId)).trim();
        const insertResult = await withRequest(instrConn, async (request) => {
          request.input('datetime', sql.DateTime, now);
          request.input('stage', sql.NVarChar, 'instructed');
          request.input('aow', sql.NVarChar, mf('newSpaceEnquiry', 'areaOfWork', mf('enquiry', 'areaOfWork', intake?.areaOfWork || 'commercial')));
          request.input('moc', sql.NVarChar, mf('newSpaceEnquiry', 'methodOfContact', prefill.methodOfContact || 'call in'));
          request.input('poc', sql.NVarChar, mf('newSpaceEnquiry', 'poc', prefill.poc || ''));
          request.input('rep', sql.NVarChar, mf('newSpaceEnquiry', 'rep', mf('deal', 'feeEarner', intake?.feeEarnerInitials || prefill.feeEarnerInitials || '')));
          request.input('first', sql.NVarChar, mf('newSpaceEnquiry', 'firstName', prefill.firstName || ''));
          request.input('last', sql.NVarChar, mf('newSpaceEnquiry', 'lastName', prefill.lastName || ''));
          request.input('email', sql.NVarChar, mf('newSpaceEnquiry', 'email', prefill.email || ''));
          request.input('phone', sql.NVarChar, mf('newSpaceEnquiry', 'phone', prefill.phone || ''));
          request.input('value', sql.NVarChar, mf('newSpaceEnquiry', 'value', prefill.value || 'unsure'));
          request.input('notes', sql.NVarChar, `Migrated from legacy route. Original matter: ${prefill.displayNumber || 'unknown'}`);
          request.input('acid', sql.NVarChar, acidValue);
          request.input('source', sql.NVarChar, mf('newSpaceEnquiry', 'source', prefill.source || 'legacy migration'));

          return (await request.query(`
            INSERT INTO dbo.enquiries (
              datetime, stage, aow, moc, poc, rep,
              first, last, email, phone, value, notes, acid, source
            )
            OUTPUT INSERTED.id
            VALUES (
              @datetime, @stage, @aow, @moc, @poc, @rep,
              @first, @last, @email, @phone, @value, @notes, @acid, @source
            )
          `)).recordset;
        });
        created.push({ type: 'newSpaceEnquiry', id: String(insertResult?.[0]?.id || acidValue) });
      } catch (err) {
        errors.push({ type: 'newSpaceEnquiry', error: err.message });
      }
    } else {
      created.push({
        type: 'newSpaceEnquiry',
        id: hasNewSpaceEnquiry
          ? String(discovered?.newSpaceEnquiries?.data?.[0]?.id || discovered?.newSpaceEnquiries?.data?.[0]?.acid || 'existing-new')
          : 'skipped',
        existing: hasNewSpaceEnquiry,
        skipped: !modules.newSpaceEnquiry && !hasNewSpaceEnquiry,
      });
    }

    /* ── 2. Create Deal (Instructions DB) if missing ──
     *  Schema: Deals (DealId IDENTITY, InstructionRef, ProspectId, Passcode, ...)
     *  DealId is auto-generated — use OUTPUT INSERTED.DealId
     *  Column names from dealCapture.js (production)
     */
    let dealId = null;
    if (modules.deal && !discovered?.deals?.found) {
      try {
        const result = await withRequest(instrConn, async (request) => {
          request.input('instrRef', sql.NVarChar, instructionRef);
          request.input('prospectId', sql.Int, prospectId);
          request.input('passcode', sql.Int, passcode);
          request.input('serviceDesc', sql.NVarChar, mf('deal', 'serviceDescription', intake?.serviceDescription || prefill.description || ''));
          request.input('amount', sql.Decimal(18, 2), parseFloat(mf('deal', 'amount', intake?.dealAmount || '0')) || 0);
          request.input('aow', sql.NVarChar, mf('deal', 'areaOfWork', intake?.areaOfWork || 'commercial'));
          request.input('pitchedBy', sql.NVarChar, mf('deal', 'feeEarner', intake?.feeEarnerInitials || prefill.feeEarnerInitials || ''));
          request.input('pitchedDate', sql.NVarChar, todayDate);
          request.input('pitchedTime', sql.NVarChar, todayTime);
          request.input('status', sql.NVarChar, mf('deal', 'checkoutMode', intake?.checkoutMode || 'CFA'));
          request.input('isMultiClient', sql.Bit, 0);
          request.input('leadClientEmail', sql.NVarChar, mf('deal', 'email', prefill.email || ''));

          return (await request.query(`
            INSERT INTO Deals (
              InstructionRef, ProspectId, Passcode, ServiceDescription, Amount, AreaOfWork,
              PitchedBy, PitchedDate, PitchedTime, Status,
              IsMultiClient, LeadClientEmail
            )
            OUTPUT INSERTED.DealId
            VALUES (
              @instrRef, @prospectId, @passcode, @serviceDesc, @amount, @aow,
              @pitchedBy, @pitchedDate, @pitchedTime, @status,
              @isMultiClient, @leadClientEmail
            )
          `)).recordset;
        });
        dealId = result?.[0]?.DealId;
        created.push({ type: 'deal', id: String(dealId || 'created') });
      } catch (err) {
        errors.push({ type: 'deal', error: err.message });
      }
    }

    /* ── 3. Create Instruction (Instructions DB) if missing ──
     *  Schema verified against temp-migrate-bizcap.mjs (40 columns, all working)
     *  Column names: Title (not Prefix), DOB (not DateOfBirth), HouseNumber (not HouseBuildingNumber)
     */
    if (modules.instruction && !discovered?.instructions?.found) {
      try {
        // Safe DOB parse
        let dobValue = null;
        const rawDob = mf('instruction', 'dob', prefill.dob || '');
        if (rawDob) {
          try { dobValue = new Date(rawDob).toISOString().split('T')[0]; } catch (_) { /* skip invalid */ }
        }

        await withRequest(instrConn, async (request) => {
          request.input('instrRef', sql.NVarChar, instructionRef);
          request.input('stage', sql.NVarChar, 'completed');
          request.input('clientType', sql.NVarChar, mf('instruction', 'clientType', prefill.isCompany ? 'company' : 'individual'));
          request.input('helixContact', sql.NVarChar, mf('instruction', 'helixContact', intake?.feeEarnerInitials || prefill.feeEarnerInitials || ''));
          request.input('consentGiven', sql.NVarChar, 'Yes');
          request.input('internalStatus', sql.NVarChar, 'instructed');
          request.input('submissionDate', sql.NVarChar, todayDate);
          request.input('submissionTime', sql.NVarChar, todayTime);
          request.input('lastUpdated', sql.NVarChar, now.toISOString());
          request.input('clientId', sql.NVarChar, prefill.clioClientId || null);
          request.input('matterId', sql.NVarChar, prefill.clioMatterId || null);
          request.input('title', sql.NVarChar, mf('instruction', 'title', prefill.prefix || ''));
          request.input('firstName', sql.NVarChar, mf('instruction', 'firstName', prefill.firstName || ''));
          request.input('lastName', sql.NVarChar, mf('instruction', 'lastName', prefill.lastName || ''));
          request.input('nationality', sql.NVarChar, mf('instruction', 'nationality', prefill.nationality || ''));
          request.input('dob', sql.NVarChar, dobValue);
          request.input('phone', sql.NVarChar, mf('instruction', 'phone', prefill.phone || ''));
          request.input('email', sql.NVarChar, mf('instruction', 'email', prefill.email || ''));
          request.input('houseNumber', sql.NVarChar, mf('instruction', 'houseNumber', prefill.address?.house || ''));
          request.input('street', sql.NVarChar, mf('instruction', 'street', prefill.address?.street || ''));
          request.input('city', sql.NVarChar, mf('instruction', 'city', prefill.address?.city || ''));
          request.input('county', sql.NVarChar, '');
          request.input('postcode', sql.NVarChar, mf('instruction', 'postcode', prefill.address?.postCode || ''));
          request.input('country', sql.NVarChar, mf('instruction', 'country', prefill.address?.country || 'United Kingdom'));
          request.input('companyName', sql.NVarChar, mf('instruction', 'companyName', prefill.companyName || null));
          request.input('companyNumber', sql.NVarChar, mf('instruction', 'companyNumber', prefill.companyNumber || null));
          request.input('notes', sql.NVarChar, `Migrated from legacy route. Display: ${prefill.displayNumber || 'unknown'}`);

          await request.query(`
            INSERT INTO Instructions (
              InstructionRef, Stage, ClientType, HelixContact, ConsentGiven, InternalStatus,
              SubmissionDate, SubmissionTime, LastUpdated,
              ClientId, MatterId,
              Title, FirstName, LastName, Nationality, DOB, Phone, Email,
              HouseNumber, Street, City, County, Postcode, Country,
              CompanyName, CompanyNumber, Notes
            ) VALUES (
              @instrRef, @stage, @clientType, @helixContact, @consentGiven, @internalStatus,
              @submissionDate, @submissionTime, @lastUpdated,
              @clientId, @matterId,
              @title, @firstName, @lastName, @nationality, @dob, @phone, @email,
              @houseNumber, @street, @city, @county, @postcode, @country,
              @companyName, @companyNumber, @notes
            )
          `);
        });
        created.push({ type: 'instruction', id: instructionRef });
      } catch (err) {
        errors.push({ type: 'instruction', error: err.message });
      }
    }

    /* ── 4. Create Matters (Instructions DB) if missing ──
     *  Schema verified against matter-operations.js + temp-migrate-bizcap.mjs
     *  Uses ClientID (not ClientId), includes ClientName, ResponsibleSolicitor etc.
     */
    if (modules.matters && !discovered?.matters?.found) {
      try {
        const matterData = moduleData.matters || {};
        const coreMatters = discovered?.coreMatters?.data || [prefill];
        for (const cm of coreMatters) {
          const displayNum = matterData.displayNumber || cm['Display Number'] || cm.displayNumber || prefill.displayNumber;
          const matterId = matterData.clioMatterId || cm['Unique ID'] || cm.clioMatterId || prefill.clioMatterId;
          if (!matterId) continue;

          await withRequest(instrConn, async (request) => {
            request.input('matterId', sql.NVarChar, String(matterId));
            request.input('instrRef', sql.NVarChar, instructionRef);
            request.input('status', sql.NVarChar, matterData.status || cm['Status'] || 'Open');
            request.input('openDate', sql.NVarChar, cm['Open Date'] ? new Date(cm['Open Date']).toISOString().split('T')[0] : todayDate);
            request.input('clientId', sql.NVarChar, String(cm['Client ID'] || prefill.clioClientId || ''));
            request.input('displayNumber', sql.NVarChar, displayNum || '');
            request.input('clientName', sql.NVarChar, matterData.clientName || cm['Client Name'] || prefill.clientName || `${prefill.firstName} ${prefill.lastName}`.trim());
            request.input('clientType', sql.NVarChar, mf('instruction', 'clientType', prefill.isCompany ? 'company' : 'individual'));
            request.input('description', sql.NVarChar, matterData.description || cm['Description'] || cm.description || prefill.description || '');
            request.input('practiceArea', sql.NVarChar, matterData.practiceArea || cm['Practice Area'] || cm.practiceArea || prefill.practiceArea || '');
            request.input('responsibleSolicitor', sql.NVarChar, matterData.responsibleSolicitor || cm['Responsible Solicitor'] || prefill.responsibleSolicitor || '');
            request.input('originatingSolicitor', sql.NVarChar, matterData.originatingSolicitor || cm['Originating Solicitor'] || prefill.originatingSolicitor || '');
            request.input('supervisingPartner', sql.NVarChar, matterData.supervisingPartner || cm['Supervising Partner'] || prefill.supervisingPartner || '');
            request.input('source', sql.NVarChar, matterData.source || cm['Source'] || prefill.source || '');
            request.input('methodOfContact', sql.NVarChar, matterData.methodOfContact || cm['method_of_contact'] || prefill.methodOfContact || '');

            await request.query(`
              INSERT INTO Matters (
                MatterID, InstructionRef, Status, OpenDate,
                ClientID, DisplayNumber, ClientName, ClientType,
                Description, PracticeArea,
                ResponsibleSolicitor, OriginatingSolicitor, SupervisingPartner,
                Source, method_of_contact
              ) VALUES (
                @matterId, @instrRef, @status, @openDate,
                @clientId, @displayNumber, @clientName, @clientType,
                @description, @practiceArea,
                @responsibleSolicitor, @originatingSolicitor, @supervisingPartner,
                @source, @methodOfContact
              )
            `);
          });
          created.push({ type: 'matter', id: displayNum || String(matterId) });
        }
      } catch (err) {
        errors.push({ type: 'matters', error: err.message });
      }
    }

    /* ── 5. Create IdVerification (Instructions DB) if missing ──
     *  Schema verified against temp-migrate-bizcap.mjs (the only proven INSERT)
     *  Uses EID-prefixed columns, NOT legacy CheckResult/PoidId
     */
    if (modules.idVerification && !discovered?.idVerifications?.found) {
      try {
        await withRequest(instrConn, async (request) => {
          request.input('instrRef', sql.NVarChar, instructionRef);
          request.input('matterId', sql.NVarChar, prefill.clioMatterId || null);
          request.input('clientId', sql.NVarChar, prefill.clioClientId || null);
          request.input('prospectId', sql.Int, prospectId);
          request.input('clientEmail', sql.NVarChar, mf('idVerification', 'email', prefill.email || ''));
          request.input('isLeadClient', sql.Bit, 1);
          request.input('eidCheckId', sql.NVarChar, mf('idVerification', 'eidCheckId', prefill.idCheckId || ''));
          request.input('eidProvider', sql.NVarChar, mf('idVerification', 'eidProvider', 'Tiller'));
          request.input('eidStatus', sql.NVarChar, (mf('idVerification', 'eidOverallResult', prefill.idCheckResult || '') === 'Passed') ? 'completed' : 'pending');
          request.input('eidOverallResult', sql.NVarChar, mf('idVerification', 'eidOverallResult', prefill.idCheckResult || 'Pending'));
          request.input('eidCheckedDate', sql.NVarChar, todayDate);
          request.input('eidCheckedTime', sql.NVarChar, todayTime);

          await request.query(`
            INSERT INTO IdVerifications (
              InstructionRef, MatterId, ClientId, ProspectId, ClientEmail, IsLeadClient,
              EIDCheckId, EIDProvider, EIDStatus, EIDOverallResult,
              EIDCheckedDate, EIDCheckedTime
            ) VALUES (
              @instrRef, @matterId, @clientId, @prospectId, @clientEmail, @isLeadClient,
              @eidCheckId, @eidProvider, @eidStatus, @eidOverallResult,
              @eidCheckedDate, @eidCheckedTime
            )
          `);
        });
        created.push({ type: 'idVerification', id: prefill.poidId });
      } catch (err) {
        errors.push({ type: 'idVerification', error: err.message });
      }
    }

    /* ── 6. Create manual payment row (Instructions DB) if missing ── */
    if (modules.payment && !discovered?.payments?.found) {
      try {
        const paymentAmount = parseFloat(mf('payment', 'amount', mf('deal', 'amount', intake?.dealAmount || '0'))) || 0;
        const paymentMethod = mf('payment', 'method', 'Bank Transfer');
        const paymentStatus = mf('payment', 'status', 'succeeded');
        const paymentRef = `banktransfer_${Date.now()}`;

        await withRequest(instrConn, async (request) => {
          request.input('id', sql.NVarChar, paymentRef);
          request.input('paymentIntentId', sql.NVarChar, paymentRef);
          request.input('amount', sql.Decimal(18, 2), paymentAmount);
          request.input('amountMinor', sql.Int, Math.round(paymentAmount * 100));
          request.input('currency', sql.NVarChar, 'GBP');
          request.input('paymentStatus', sql.NVarChar, paymentStatus);
          request.input('internalStatus', sql.NVarChar, paymentStatus === 'succeeded' ? 'paid' : 'pending');
          request.input('metadata', sql.NVarChar(sql.MAX), JSON.stringify({
            source: 'legacy-migration-modal',
            method: paymentMethod,
            status: paymentStatus,
            notes: 'Manual payment backfill from migration modal',
          }));
          request.input('instructionRef', sql.NVarChar, instructionRef);
          request.input('serviceDescription', sql.NVarChar(sql.MAX), mf('deal', 'serviceDescription', intake?.serviceDescription || prefill.description || ''));
          request.input('areaOfWork', sql.NVarChar(100), mf('deal', 'areaOfWork', intake?.areaOfWork || prefill.areaOfWork || 'commercial'));
          request.input('createdAt', sql.DateTime2, now);
          request.input('updatedAt', sql.DateTime2, now);

          await request.query(`
            INSERT INTO Payments (
              id, payment_intent_id, amount, amount_minor, currency,
              payment_status, internal_status, metadata,
              instruction_ref, service_description, area_of_work,
              created_at, updated_at
            ) VALUES (
              @id, @paymentIntentId, @amount, @amountMinor, @currency,
              @paymentStatus, @internalStatus, @metadata,
              @instructionRef, @serviceDescription, @areaOfWork,
              @createdAt, @updatedAt
            )
          `);

          const instructionColumns = await request.query(`
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Instructions'
          `);
          const cols = new Set((instructionColumns.recordset || []).map((row) => String(row.COLUMN_NAME || '').trim()));

          const updates = [];
          if (cols.has('PaymentStatus')) updates.push(`PaymentStatus = '${paymentStatus === 'succeeded' ? 'Paid' : 'Pending'}'`);
          if (cols.has('payment_status')) updates.push(`payment_status = '${paymentStatus === 'succeeded' ? 'Paid' : 'Pending'}'`);
          if (cols.has('TotalPaid')) updates.push(`TotalPaid = ${paymentAmount}`);
          if (cols.has('total_paid')) updates.push(`total_paid = ${paymentAmount}`);
          if (cols.has('PaymentMethod')) updates.push(`PaymentMethod = '${paymentMethod.replace(/'/g, "''")}'`);
          if (cols.has('payment_method')) updates.push(`payment_method = '${paymentMethod.replace(/'/g, "''")}'`);
          if (cols.has('LastUpdated')) updates.push(`LastUpdated = '${now.toISOString()}'`);
          if (cols.has('updated_at')) updates.push(`updated_at = '${now.toISOString()}'`);

          if (updates.length > 0) {
            await request.query(`
              UPDATE Instructions
              SET ${updates.join(', ')}
              WHERE InstructionRef = @instructionRef
            `);
          }
        });

        created.push({ type: 'payment', id: paymentRef });
      } catch (err) {
        errors.push({ type: 'payment', error: err.message });
      }
    }

    /* ── 7. Link to existing instruction matter/client context ── */
    if (modules.linkage && mf('linkage', 'sourceInstructionRef', '').trim()) {
      try {
        const sourceInstructionRef = mf('linkage', 'sourceInstructionRef', '').trim();
        const manualRelated = mf('linkage', 'relatedClientIds', '').trim();
        const linkMode = mf('linkage', 'mode', 'full').trim().toLowerCase();

        await withRequest(instrConn, async (request) => {
          request.input('sourceInstructionRef', sql.NVarChar, sourceInstructionRef);
          request.input('targetInstructionRef', sql.NVarChar, instructionRef);

          const source = (await request.query(`
            SELECT TOP 1 ClientId, MatterId, RelatedClientId
            FROM Instructions
            WHERE InstructionRef = @sourceInstructionRef
          `)).recordset?.[0];

          const target = (await request.query(`
            SELECT TOP 1 ClientId, MatterId, RelatedClientId
            FROM Instructions
            WHERE InstructionRef = @targetInstructionRef
          `)).recordset?.[0];

          if (!source || !target) {
            throw new Error('Linkage source/target instruction not found');
          }

          const mergedRelated = mergeCsvIds(
            target.RelatedClientId,
            source.RelatedClientId,
            manualRelated
          );

          request.input('mergedRelated', sql.NVarChar, mergedRelated);

          if (linkMode === 'related-only') {
            await request.query(`
              UPDATE Instructions
              SET RelatedClientId = @mergedRelated, LastUpdated = '${now.toISOString()}'
              WHERE InstructionRef = @targetInstructionRef
            `);
          } else {
            request.input('clientId', sql.NVarChar, source.ClientId || target.ClientId || null);
            request.input('matterId', sql.NVarChar, source.MatterId || target.MatterId || null);
            await request.query(`
              UPDATE Instructions
              SET
                ClientId = @clientId,
                MatterId = @matterId,
                RelatedClientId = @mergedRelated,
                LastUpdated = '${now.toISOString()}'
              WHERE InstructionRef = @targetInstructionRef
            `);
          }
        });

        created.push({ type: 'linkage', id: sourceInstructionRef });
      } catch (err) {
        errors.push({ type: 'linkage', error: err.message });
      }
    }

    const success = errors.length === 0;
    trackEvent(success ? 'Migration.Execute.Completed' : 'Migration.Execute.PartialFailure', {
      instructionRef,
      created: String(created.length),
      errors: String(errors.length),
      user: userDisplay,
    });

    res.json({
      success,
      instructionRef,
      prospectId,
      passcode,
      dealId: String(dealId || ''),
      created,
      errors,
    });
  } catch (err) {
    trackException(err, { operation: 'migration-execute', phase: 'outer' });
    console.error('[Migration][execute] Error:', err.message);
    res.status(500).json({ error: 'Migration failed', detail: err.message });
  }
});

module.exports = router;
