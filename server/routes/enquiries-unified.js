const express = require('express');
const { withRequest, sql } = require('../utils/db');
const { cacheUnified, generateCacheKey, CACHE_CONFIG, deleteCachePattern } = require('../utils/redisClient');
const { loggers } = require('../utils/logger');
const { attachEnquiriesStream, broadcastEnquiriesChanged } = require('../utils/enquiries-stream');
const router = express.Router();

const log = loggers.enquiries;
const VALID_SOURCE_BIASES = new Set(['legacy-primary', 'new-primary', 'legacy-only', 'new-only']);
const VALID_PROCESSING_APPROACHES = new Set(['unified', 'area-personalised']);
const MEMORY_UNIFIED_CACHE_TTL_MS = 15 * 1000;
const MEMORY_UNIFIED_CACHE_STALE_MS = 60 * 1000;
const unifiedMemoryCache = new Map();

function getMemoryUnifiedEntry(cacheKey) {
  const entry = unifiedMemoryCache.get(cacheKey);
  if (!entry) return null;

  const ageMs = Date.now() - entry.ts;
  if (ageMs >= MEMORY_UNIFIED_CACHE_TTL_MS + MEMORY_UNIFIED_CACHE_STALE_MS) {
    unifiedMemoryCache.delete(cacheKey);
    return null;
  }

  return {
    ...entry,
    ageMs,
    isFresh: ageMs < MEMORY_UNIFIED_CACHE_TTL_MS,
  };
}

function setMemoryUnifiedEntry(cacheKey, data) {
  unifiedMemoryCache.set(cacheKey, {
    data,
    ts: Date.now(),
    refreshPromise: null,
  });
}

function clearUnifiedMemoryCache() {
  unifiedMemoryCache.clear();
}

const normaliseEmail = (value) => String(value || '').trim().toLowerCase();

const parseSharedWithEmails = (value) => {
  return String(value || '')
    .split(/[;,\n]/)
    .map((entry) => normaliseEmail(entry))
    .filter(Boolean);
};

const serialiseSharedWithEmails = (value) => {
  return Array.from(new Set(parseSharedWithEmails(value))).join(',');
};

const isUserInSharedWith = (sharedWith, userEmail) => {
  const target = normaliseEmail(userEmail);
  if (!target) return false;
  return parseSharedWithEmails(sharedWith).includes(target);
};

const normaliseSourceBias = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  return VALID_SOURCE_BIASES.has(candidate) ? candidate : 'legacy-primary';
};

const normaliseProcessingApproach = (value) => {
  const candidate = String(value || '').trim().toLowerCase();
  return VALID_PROCESSING_APPROACHES.has(candidate) ? candidate : 'unified';
};

const mergeIfBlank = (target, targetField, source, sourceField = targetField) => {
  if (!target || !source) return;

  const targetValue = target[targetField];
  const sourceValue = source[sourceField];

  if ((targetValue === null || targetValue === undefined || String(targetValue).trim() === '') &&
      sourceValue !== null && sourceValue !== undefined && String(sourceValue).trim() !== '') {
    target[targetField] = sourceValue;
  }
};

const annotateProcessingIdentity = (record, { processingEnquiryId, processingSource, legacyEnquiryId, sourceBias, processingApproach }) => {
  record.processingEnquiryId = processingEnquiryId;
  record.processingSource = processingSource;
  record.legacyEnquiryId = legacyEnquiryId || null;
  record.sourceBias = sourceBias;
  record.processingApproach = processingApproach;
  return record;
};

async function instructionsHasColumn(instructionsConnectionString, columnName) {
  try {
    const result = await withRequest(instructionsConnectionString, async (request) => {
      request.input('tableName', sql.VarChar(128), 'enquiries');
      request.input('columnName', sql.VarChar(128), columnName);
      return await request.query(`
        SELECT TOP 1 1 as hasColumn
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = @tableName AND COLUMN_NAME = @columnName
      `);
    });
    return (result?.recordset?.length || 0) > 0;
  } catch (error) {
    log.warn(`Failed to inspect instructions column ${columnName}:`, error?.message || error);
    return false;
  }
}

// SSE stream endpoint: GET /api/enquiries-unified/stream
// Emits lightweight "enquiries.changed" events on mutations so clients can refresh.
attachEnquiriesStream(router);

// Lightweight pulse endpoint to detect new enquiries without heavy payloads.
// GET /api/enquiries-unified/pulse
router.get('/pulse', async (req, res) => {
  const mainConnectionString = process.env.SQL_CONNECTION_STRING; // helix-core-data
  const instructionsConnectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING; // instructions DB

  const warnings = [];
  let mainLatest = null;
  let instructionsLatest = null;

  try {
    if (mainConnectionString) {
      const result = await withRequest(mainConnectionString, async (request) => {
        return await request.query(`
          SELECT TOP 1 Date_Created as latest
          FROM enquiries
          ORDER BY Date_Created DESC
        `);
      });
      mainLatest = result?.recordset?.[0]?.latest || null;
    }
  } catch (err) {
    warnings.push({ source: 'main', message: err?.message || String(err) });
  }

  try {
    if (instructionsConnectionString) {
      const result = await withRequest(instructionsConnectionString, async (request) => {
        return await request.query(`
          SELECT TOP 1 datetime as latest
          FROM dbo.enquiries
          ORDER BY datetime DESC
        `);
      });
      instructionsLatest = result?.recordset?.[0]?.latest || null;
    }
  } catch (err) {
    warnings.push({ source: 'instructions', message: err?.message || String(err) });
  }

  const latestCandidates = [mainLatest, instructionsLatest]
    .map((value) => (value ? new Date(value).getTime() : NaN))
    .filter((value) => Number.isFinite(value));

  const latestTimestamp = latestCandidates.length
    ? new Date(Math.max(...latestCandidates)).toISOString()
    : null;

  res.json({
    latestTimestamp,
    sources: {
      main: mainLatest ? new Date(mainLatest).toISOString() : null,
      instructions: instructionsLatest ? new Date(instructionsLatest).toISOString() : null,
    },
    warnings,
  });
});

// Route: GET /api/enquiries-unified
// Direct database connections to fetch enquiries from BOTH database sources
router.get('/', async (req, res) => {
  try {
    log.debug('Unified enquiries route called');

    // Parse query parameters for filtering and pagination
    const limit = Math.min(parseInt(req.query.limit, 10) || 1000, 2500); // Default 1000, max 2500
    const email = (req.query.email || '').trim().toLowerCase();
    const initials = (req.query.initials || '').trim().toLowerCase();
    const includeTeamInbox = String(req.query.includeTeamInbox || 'true').toLowerCase() === 'true';
    const fetchAll = String(req.query.fetchAll || 'false').toLowerCase() === 'true';
    const sourceBias = normaliseSourceBias(req.query.sourceBias);
    const processingApproach = normaliseProcessingApproach(req.query.processingApproach);
    const dateFrom = req.query.dateFrom || '';
    const dateTo = req.query.dateTo || '';
    const prospectId = (req.query.prospectId || '').toString().trim();
    const hasProspectId = prospectId.length > 0;
    const bypassCache = String(req.query.bypassCache || 'false').toLowerCase() === 'true';
    const effectiveBypassCache = bypassCache || hasProspectId;
    
    log.debug('bypassCache parameter:', bypassCache);

    // Build cache params (not a prebuilt key) for consistent unified cache keys
    const cacheParams = [
      'enquiries-v5', // bump cache schema to invalidate old payloads
      limit,
      email,
      initials,
      includeTeamInbox,
      fetchAll,
      sourceBias,
      processingApproach,
      dateFrom,
      dateTo,
      prospectId
    ].filter(p => p !== '' && p !== null && p !== undefined);
    const memoryCacheKey = generateCacheKey(CACHE_CONFIG.PREFIXES.UNIFIED, 'data', ...cacheParams);

    if (!effectiveBypassCache) {
      const memoryEntry = getMemoryUnifiedEntry(memoryCacheKey);
      if (memoryEntry?.isFresh) {
        return res.json({ ...memoryEntry.data, cached: true, source: 'memory' });
      }

      if (memoryEntry && !memoryEntry.refreshPromise) {
        memoryEntry.refreshPromise = (async () => {
          try {
            const freshData = await performUnifiedEnquiriesQuery(req.query);
            setMemoryUnifiedEntry(memoryCacheKey, freshData);
          } catch (error) {
            log.warn('Background enquiries memory refresh failed:', error?.message || error);
          } finally {
            const currentEntry = unifiedMemoryCache.get(memoryCacheKey);
            if (currentEntry) {
              currentEntry.refreshPromise = null;
            }
          }
        })();
        unifiedMemoryCache.set(memoryCacheKey, memoryEntry);
      }

      if (memoryEntry) {
        return res.json({ ...memoryEntry.data, cached: true, source: 'memory-stale' });
      }
    }

    // Use Redis cache wrapper if not bypassed
    if (!effectiveBypassCache) {
      const result = await cacheUnified(cacheParams, async () => {
        return await performUnifiedEnquiriesQuery(req.query);
      });
      setMemoryUnifiedEntry(memoryCacheKey, result);
      return res.json({ ...result, cached: true });
    }

    // Bypass cache - direct query
    const result = await performUnifiedEnquiriesQuery(req.query);
    setMemoryUnifiedEntry(memoryCacheKey, result);
    res.json({ ...result, cached: false });

  } catch (error) {
    log.error('Error in enquiries-unified route:', error?.message);
    // Return a tolerant 200 with warnings to avoid blocking the UI
    res.status(200).json({
      enquiries: [],
      count: 0,
      sources: { main: 0, instructions: 0, unique: 0 },
      warnings: [{ source: 'unified', message: error?.message || 'Unknown error' }],
      migration: { total: 0, migrated: 0, partial: 0, notMigrated: 0, instructionsOnly: 0, migrationRate: '0.0%', crossReferenceMap: {} }
    });
  }
});

/**
 * Perform the actual unified enquiries query (extracted for caching)
 */
async function performUnifiedEnquiriesQuery(queryParams) {
  log.debug('Performing fresh unified enquiries query');
  log.debug('Query params:', queryParams);

  const fetchAll = String(queryParams.fetchAll || 'false').toLowerCase() === 'true';
  const sourceBias = normaliseSourceBias(queryParams.sourceBias);
  const processingApproach = normaliseProcessingApproach(queryParams.processingApproach);
  const includeLegacySource = sourceBias !== 'new-only';
  const includeInstructionsSource = sourceBias !== 'legacy-only';
  const preferInstructionsPrimary = sourceBias === 'new-primary' || sourceBias === 'new-only';
  const prospectIdRaw = (queryParams.prospectId || '').toString().trim();
  const prospectIdInt = Number.parseInt(prospectIdRaw, 10);
  const hasProspectId = Number.isFinite(prospectIdInt);
  // When fetchAll=true, allow much higher limits for "All" mode
  const maxLimit = fetchAll ? 50000 : 2500;
  let limit = Math.min(parseInt(queryParams.limit, 10) || 1000, maxLimit);
  if (hasProspectId) {
    limit = Math.min(limit, 50);
  }
  log.debug(`Limit settings: fetchAll=${fetchAll}, maxLimit=${maxLimit}, finalLimit=${limit}`);
  
  const email = (queryParams.email || '').trim().toLowerCase();
  const initials = (queryParams.initials || '').trim().toLowerCase();
  const includeTeamInbox = String(queryParams.includeTeamInbox || 'true').toLowerCase() === 'true';
  const dateFrom = queryParams.dateFrom || '';
  const dateTo = queryParams.dateTo || '';

  // Connection strings for both databases
  const mainConnectionString = process.env.SQL_CONNECTION_STRING; // helix-core-data
  const instructionsConnectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING; // instructions DB

  if (!mainConnectionString || !instructionsConnectionString) {
    log.error('Required connection strings not found in environment');
    throw new Error('Database configuration missing');
  }

  // Collect warnings and debug info
  const warnings = [];
  const hasInstructionsSharedWithColumn = await instructionsHasColumn(instructionsConnectionString, 'shared_with');

  // Main DB query
  let mainEnquiries = [];
  let mainWhereClause = '';
  try {
    if (!includeLegacySource) {
      mainEnquiries = [];
      log.debug('Skipping legacy enquiries query due to source bias');
    } else {
    const result = await withRequest(mainConnectionString, async (request) => {
      const filters = [];

      if (dateFrom && !hasProspectId) {
        request.input('dateFrom', sql.DateTime2, new Date(dateFrom));
        filters.push('Date_Created >= @dateFrom');
      }
      if (dateTo && !hasProspectId) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        request.input('dateTo', sql.DateTime2, endDate);
        filters.push('Date_Created <= @dateTo');
      }

      if (hasProspectId) {
        request.input('prospectId', sql.Int, prospectIdInt);
        filters.push('ID = @prospectId');
      }

      // User filtering (unless fetchAll is true)
      if (!hasProspectId && !fetchAll && (email || initials)) {
        const pocConditions = [];
        if (email) {
          request.input('userEmail', sql.VarChar(255), email);
          pocConditions.push("LOWER(LTRIM(RTRIM(Point_of_Contact))) = @userEmail");
        }
        if (initials) {
          request.input('userInitials', sql.VarChar(50), initials.replace(/\./g, ''));
          pocConditions.push("LOWER(REPLACE(REPLACE(LTRIM(RTRIM(Point_of_Contact)), ' ', ''), '.', '')) = @userInitials");
        }
        if (includeTeamInbox) {
          pocConditions.push("LOWER(LTRIM(RTRIM(Point_of_Contact))) IN ('team@helix-law.com', 'team', 'team inbox')");
          pocConditions.push("Point_of_Contact IS NULL OR LTRIM(RTRIM(Point_of_Contact)) = ''");
        }
        if (pocConditions.length > 0) filters.push(`(${pocConditions.join(' OR ')})`);
      }

      request.input('limit', sql.Int, limit);
      mainWhereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

      return await request.query(`
        SELECT TOP (@limit)
          ID,
          ID as id,
          Date_Created as datetime,
          Tags as stage,
          NULL as claim,
          Point_of_Contact as poc,
          Area_of_Work as pitch,
          Area_of_Work as aow,
          Type_of_Work as tow,
          Method_of_Contact as moc,
          Contact_Referrer as rep,
          First_Name,
          First_Name as first,
          Last_Name,
          Last_Name as last,
          Email as email,
          Phone_Number as phone,
          NULL as uid,
          NULL as displayNumber,
          NULL as postcode,
          Initial_first_call_notes,
          Initial_first_call_notes as notes,
          NULL as convertDate,
          Value,
          Rating,
          Ultimate_Source,
          'main' as _dbSource,
          'not-checked' as migrationStatus
        FROM enquiries
        ${mainWhereClause}
        ORDER BY Date_Created DESC
      `);
    });
    mainEnquiries = Array.isArray(result.recordset) ? result.recordset : [];
    }
    log.debug(`Main DB returned: ${mainEnquiries.length} enquiries`);
  } catch (err) {
    log.error('Main DB enquiries query failed:', err?.message || err);
    warnings.push({ source: 'main', message: err?.message || String(err) });
    mainEnquiries = [];
  }

  // Instructions DB query
  let instructionsEnquiries = [];
  let instWhereClause = '';
  try {
    if (!includeInstructionsSource) {
      instructionsEnquiries = [];
      log.debug('Skipping instructions enquiries query due to source bias');
    } else {
    const result = await withRequest(instructionsConnectionString, async (request) => {
      const filters = [];
      if (dateFrom && !hasProspectId) {
        request.input('dateFrom', sql.DateTime2, new Date(dateFrom));
        filters.push('datetime >= @dateFrom');
      }
      if (dateTo && !hasProspectId) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        request.input('dateTo', sql.DateTime2, endDate);
        filters.push('datetime <= @dateTo');
      }
      if (hasProspectId) {
        request.input('prospectIdStr', sql.NVarChar(100), prospectIdRaw);
        // Deals.ProspectId = ActiveCampaign contact ID.
        // New-space: acid = AC contact ID (the bridge), id = internal PK (auto-increment).
        // Legacy: ID = PK which also served as the AC bridge.
        // Match both columns so we find the record regardless of which value was stored.
        filters.push('(id = @prospectIdStr OR acid = @prospectIdStr)');
      }
      if (!fetchAll && (email || initials)) {
        const pocConditions = [];
        if (email) {
          request.input('userEmail', sql.VarChar(255), email);
          pocConditions.push("LOWER(LTRIM(RTRIM(poc))) = @userEmail");
          if (hasInstructionsSharedWithColumn) {
            pocConditions.push("(',' + LOWER(REPLACE(REPLACE(ISNULL(shared_with, ''), ' ', ''), ';', ',')) + ',') LIKE '%,' + @userEmail + ',%'");
          }
        }
        if (initials) {
          request.input('userInitials', sql.VarChar(50), initials.replace(/\./g, ''));
          pocConditions.push("LOWER(REPLACE(REPLACE(LTRIM(RTRIM(poc)), ' ', ''), '.', '')) = @userInitials");
        }
        if (includeTeamInbox) {
          pocConditions.push("LOWER(LTRIM(RTRIM(poc))) IN ('team@helix-law.com', 'team', 'team inbox')");
          pocConditions.push("poc IS NULL OR LTRIM(RTRIM(poc)) = ''");
        }
        if (pocConditions.length > 0) filters.push(`(${pocConditions.join(' OR ')})`);
      }
      request.input('limit', sql.Int, limit);
      instWhereClause = filters.length > 0 ? `WHERE ${filters.join(' AND ')}` : '';

      return await request.query(`
        SELECT TOP (@limit)
          id,
          datetime,
          stage,
          claim,
          poc,
          pitch,
          aow,
          tow,
          moc,
          rep,
          first,
          last,
          email,
          phone,
          acid,
          source,
          url,
          contact_referrer,
          company_referrer,
          gclid,
          ${hasInstructionsSharedWithColumn ? 'shared_with,' : 'CAST(NULL as NVARCHAR(1000)) as shared_with,'}
          NULL as uid,
          NULL as displayNumber,
          NULL as postcode,
          notes,
          NULL as convertDate,
          value as Value,
          rating as Rating,
          'instructions' as _dbSource,
          'not-checked' as migrationStatus
        FROM dbo.enquiries
        ${instWhereClause}
        ORDER BY datetime DESC
      `);
    });
    instructionsEnquiries = Array.isArray(result.recordset) ? result.recordset : [];
    }
    log.debug(`Instructions DB returned: ${instructionsEnquiries.length} enquiries`);
  } catch (err) {
    log.error('Instructions DB enquiries query failed:', err?.message || err);
    warnings.push({ source: 'instructions', message: err?.message || String(err) });
    instructionsEnquiries = [];
  }

  // Cross-reference and merge
  const crossReferenceMap = new Map();
  
  // PRIMARY: Match by acid (legacy ID stored in new DB)
  instructionsEnquiries.forEach(inst => {
    if (inst.acid) {
      const match = mainEnquiries.find(mainEnq => String(mainEnq.id) === String(inst.acid));
      if (match) {
        crossReferenceMap.set(match.id, inst.id);
        match.migrationStatus = 'migrated';
        inst.migrationStatus = 'migrated';
      }
    }
  });
  
  // FALLBACK: Match by email/phone AND same calendar day for records not yet cross-referenced
  // This avoids over-merging distinct enquiries from the same contact on different days.
  const toDateOnly = (d) => {
    try {
      const dt = new Date(d);
      if (isNaN(dt.getTime())) return '';
      return dt.toISOString().split('T')[0];
    } catch { return ''; }
  };

  mainEnquiries.forEach(mainEnq => {
    if (mainEnq.migrationStatus === 'not-checked' && (mainEnq.email || mainEnq.phone)) {
      const mainDay = toDateOnly(mainEnq.datetime || mainEnq.Date_Created);
      const match = instructionsEnquiries.find(inst => {
        if (inst.migrationStatus !== 'not-checked') return false;
        const sameEmail = (mainEnq.email && inst.email && String(mainEnq.email).toLowerCase() === String(inst.email).toLowerCase());
        const samePhone = (mainEnq.phone && inst.phone && String(mainEnq.phone) === String(inst.phone));
        if (!sameEmail && !samePhone) return false;
        const instDay = toDateOnly(inst.datetime);
        return mainDay && instDay && mainDay === instDay;
      });
      if (match) {
        crossReferenceMap.set(mainEnq.id, match.id);
        mainEnq.migrationStatus = 'partial';
        match.migrationStatus = 'partial';
      }
    }
  });

  // Build reverse map from instructions id to matched legacy record (if any)
  const instToMainMatch = new Map();
  if (crossReferenceMap.size > 0) {
    instructionsEnquiries.forEach(inst => {
      // find main id that maps to this instruction id
      for (const [mainId, instId] of crossReferenceMap.entries()) {
        if (String(instId) === String(inst.id)) {
          const matched = mainEnquiries.find(m => String(m.id) === String(mainId));
          if (matched) instToMainMatch.set(inst.id, matched);
        }
      }
    });
  }

  // Build a set of instruction ids that correspond to a legacy record (via acid or fallback)
  const matchedInstructionIds = new Set();
  for (const [mainId, instId] of crossReferenceMap.entries()) {
    const instructionsMatch = instructionsEnquiries.find((inst) => String(inst.id) === String(instId));
    const collaboratorOnlyView = Boolean(
      email &&
      instructionsMatch &&
      isUserInSharedWith(instructionsMatch.shared_with, email) &&
      normaliseEmail(instructionsMatch.poc) !== normaliseEmail(email)
    );
    if (!collaboratorOnlyView) {
      matchedInstructionIds.add(String(instId));
    }
  }

  const uniqueEnquiries = [];
  const seenIds = new Set();

  if (preferInstructionsPrimary) {
    instructionsEnquiries.forEach((enquiry) => {
      const pairedMain = instToMainMatch.get(enquiry.id);

      if (pairedMain) {
        mergeIfBlank(enquiry, 'Ultimate_Source', pairedMain, 'Ultimate_Source');
        mergeIfBlank(enquiry, 'Company', pairedMain, 'Company');
        mergeIfBlank(enquiry, 'Date_Created', pairedMain, 'Date_Created');
        mergeIfBlank(enquiry, 'Touchpoint_Date', pairedMain, 'Date_Created');
        mergeIfBlank(enquiry, 'Point_of_Contact', pairedMain, 'Point_of_Contact');
        mergeIfBlank(enquiry, 'First_Name', pairedMain, 'First_Name');
        mergeIfBlank(enquiry, 'Last_Name', pairedMain, 'Last_Name');
        mergeIfBlank(enquiry, 'Phone_Number', pairedMain, 'Phone_Number');
        mergeIfBlank(enquiry, 'Method_of_Contact', pairedMain, 'Method_of_Contact');
      }

      try {
        enquiry.pitchEnquiryId = enquiry.id;
        annotateProcessingIdentity(enquiry, {
          processingEnquiryId: enquiry.id,
          processingSource: 'new',
          legacyEnquiryId: pairedMain?.id || enquiry.acid || null,
          sourceBias,
          processingApproach,
        });
      } catch { /* ignore */ }

      const compositeKey = `instructions-${enquiry.id}`;
      if (!seenIds.has(compositeKey)) {
        seenIds.add(compositeKey);
        uniqueEnquiries.push(enquiry);
      }
    });

    if (includeLegacySource) {
      mainEnquiries.forEach((enquiry) => {
        if (crossReferenceMap.has(enquiry.id)) return;

        annotateProcessingIdentity(enquiry, {
          processingEnquiryId: enquiry.id,
          processingSource: 'legacy',
          legacyEnquiryId: enquiry.id,
          sourceBias,
          processingApproach,
        });

        const pocLower = (enquiry.poc || '').toString().trim().toLowerCase();
        const firstName = (enquiry.First_Name || '').toString().trim().toLowerCase();
        const lastName = (enquiry.Last_Name || '').toString().trim().toLowerCase();
        const email = (enquiry.email || '').toString().trim().toLowerCase();
        const dateCreated = enquiry.Date_Created || enquiry.datetime || '';
        const compositeKey = `main-${enquiry.id}-${pocLower}-${firstName}-${lastName}-${email}-${dateCreated}`;
        if (!seenIds.has(compositeKey)) {
          seenIds.add(compositeKey);
          uniqueEnquiries.push(enquiry);
        }
      });
    }
  } else {

  // Prefer legacy: add all legacy records first (with enhanced composite key to preserve distinct records)
  mainEnquiries.forEach(enquiry => {
    // Expose the corresponding instructions DB id for downstream integrations (e.g. Pitch)
    // For migrated/partial records, crossReferenceMap maps legacy id -> instructions id.
    try {
      const mapped = crossReferenceMap.get(enquiry.id);
      if (mapped !== undefined && mapped !== null) {
        enquiry.pitchEnquiryId = mapped;

        // Merge enriched fields from the paired instructions record.
        // Claiming via Teams only updates the instructions DB, so the legacy record
        // can have a stale POC (e.g. "team@helix-law.com") while the instructions
        // record has the claimer's email. Prefer the more advanced state.
        const paired = instructionsEnquiries.find(inst => String(inst.id) === String(mapped));
        if (paired) {
          const legacyPoc = (enquiry.poc || '').toString().trim().toLowerCase();
          const instrPoc = (paired.poc || '').toString().trim().toLowerCase();
          const isLegacyUnclaimed = !legacyPoc || legacyPoc === 'team@helix-law.com' || legacyPoc === 'team' || legacyPoc === 'team inbox';
          const isInstrClaimed = instrPoc && instrPoc !== 'team@helix-law.com' && instrPoc !== 'team' && instrPoc !== 'team inbox';

          if (isLegacyUnclaimed && isInstrClaimed) {
            enquiry.poc = paired.poc;
            enquiry.Point_of_Contact = paired.poc;
          }
          // Also merge stage and claim if the instructions record is more advanced
          if (paired.stage && !enquiry.stage) {
            enquiry.stage = paired.stage;
          }
          if (paired.claim && !enquiry.claim) {
            enquiry.claim = paired.claim;
          }
          if (paired.shared_with) {
            enquiry.shared_with = paired.shared_with;
          }
          // Merge enriched data fields from instructions record when legacy has nulls.
          // The instructions DB is often populated by the intake form while the legacy
          // Core Data record may have NULLs for these columns.
          const mergeIfNull = (legacyField, instrField) => {
            instrField = instrField || legacyField;
            if ((enquiry[legacyField] === null || enquiry[legacyField] === undefined || String(enquiry[legacyField]).trim() === '') &&
                paired[instrField] !== null && paired[instrField] !== undefined && String(paired[instrField]).trim() !== '') {
              enquiry[legacyField] = paired[instrField];
            }
          };
          mergeIfNull('aow');
          mergeIfNull('pitch');
          mergeIfNull('Value');
          mergeIfNull('tow');
          mergeIfNull('first', 'first');
          mergeIfNull('First_Name', 'first');
          mergeIfNull('last', 'last');
          mergeIfNull('Last_Name', 'last');
          mergeIfNull('notes');
          mergeIfNull('Rating', 'Rating');
        }
      }
    } catch { /* ignore */ }

    annotateProcessingIdentity(enquiry, {
      processingEnquiryId: enquiry.pitchEnquiryId || enquiry.id,
      processingSource: enquiry.pitchEnquiryId ? 'new' : 'legacy',
      legacyEnquiryId: enquiry.id,
      sourceBias,
      processingApproach,
    });

    const pocLower = (enquiry.poc || '').toString().trim().toLowerCase();
    const firstName = (enquiry.First_Name || '').toString().trim().toLowerCase();
    const lastName = (enquiry.Last_Name || '').toString().trim().toLowerCase();
    const email = (enquiry.email || '').toString().trim().toLowerCase();
    const dateCreated = enquiry.Date_Created || enquiry.datetime || '';
    
    // Enhanced composite key to handle shared prospect IDs with different people
    // Include name and date to distinguish between different people with same ID+POC
    const compositeKey = `main-${enquiry.id}-${pocLower}-${firstName}-${lastName}-${email}-${dateCreated}`;
    if (!seenIds.has(compositeKey)) {
      seenIds.add(compositeKey);
      uniqueEnquiries.push(enquiry);
    }
  });

  // Then add instructions records that do NOT match any legacy record (not in matchedInstructionIds)
  instructionsEnquiries.forEach(enquiry => {
    const isMatchedToLegacy = matchedInstructionIds.has(String(enquiry.id));
    if (isMatchedToLegacy) return; // suppress new when a legacy counterpart exists

    // For instructions-only records, the Pitch enquiry id is the instructions id
    try {
      enquiry.pitchEnquiryId = enquiry.id;
      annotateProcessingIdentity(enquiry, {
        processingEnquiryId: enquiry.id,
        processingSource: 'new',
        legacyEnquiryId: enquiry.acid || null,
        sourceBias,
        processingApproach,
      });
    } catch { /* ignore */ }

    const compositeKey = `instructions-${enquiry.id}`;
    if (!seenIds.has(compositeKey)) {
      seenIds.add(compositeKey);
      uniqueEnquiries.push(enquiry);
    }
  });
  }

  const migrationStats = {
    total: mainEnquiries.length,
    migrated: 0,
    partial: 0,
    notMigrated: 0,
    instructionsOnly: instructionsEnquiries.filter(e => e.migrationStatus === 'instructions-only').length
  };
  mainEnquiries.forEach(enq => {
    switch (enq.migrationStatus) {
      case 'migrated':
        migrationStats.migrated++;
        break;
      case 'partial':
        migrationStats.partial++;
        break;
      case 'not-migrated':
        migrationStats.notMigrated++;
        break;
    }
  });

  const migrationRate = migrationStats.total > 0
    ? ((migrationStats.migrated / migrationStats.total) * 100).toFixed(1)
    : '0.0';

  const responsePayload = {
    enquiries: uniqueEnquiries,
    count: uniqueEnquiries.length,
    sources: {
      main: mainEnquiries.length,
      instructions: instructionsEnquiries.length,
      unique: uniqueEnquiries.length
    },
    warnings,
    debug: {
      mainWhereClause,
      instWhereClause,
      sourceBias,
      processingApproach,
    },
    processingModel: {
      sourceBias,
      processingApproach,
      primarySource: preferInstructionsPrimary ? 'instructions' : 'legacy',
      includesLegacyFallback: includeLegacySource,
      includesInstructions: includeInstructionsSource,
    },
    migration: {
      ...migrationStats,
      migrationRate: `${migrationRate}%`,
      crossReferenceMap: Object.fromEntries(crossReferenceMap)
    }
  };

  const payloadSize = JSON.stringify(responsePayload).length;
  const payloadMB = (payloadSize / 1024 / 1024).toFixed(2);
  log.info(`Response: ${uniqueEnquiries.length} enquiries, ${payloadMB}MB payload`);

  return responsePayload;
}

// (removed corrupted duplicate POST /update route)

// Route: POST /api/enquiries-unified/update
// Update enquiry fields in BOTH databases (legacy and new instructions)
router.post('/update', async (req, res) => {
  const { ID, processingEnquiryId, processingSource, ...updates } = req.body;

  log.debug('Update request received:', {
    ID,
    processingEnquiryId,
    processingSource,
    IDType: typeof ID,
    updates,
  });

  if (!ID && !processingEnquiryId) return res.status(400).json({ error: 'Enquiry ID is required' });
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No updates provided' });

  const displayEnquiryId = String(ID ?? '').trim();
  const explicitProcessingEnquiryId = String(processingEnquiryId ?? '').trim();
  const normalisedProcessingSource = String(processingSource ?? '').trim().toLowerCase();

  // Ensure IDs are strings
  const enquiryId = explicitProcessingEnquiryId || displayEnquiryId;

  try {
    const mainConnectionString = process.env.SQL_CONNECTION_STRING;
    const instructionsConnectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    
    if (!mainConnectionString || !instructionsConnectionString) {
      log.error('Database connection strings not found in environment');
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    const hasInstructionsSharedWithColumn = await instructionsHasColumn(instructionsConnectionString, 'shared_with');

    // Check which database(s) contain this enquiry.
    // ID taxonomy:
    //   Legacy (Core Data):      enquiries.ID = auto-increment PK (also the AC bridge for legacy records)
    //   New-space (Instructions): enquiries.id = auto-increment internal PK
    //                             enquiries.acid = ActiveCampaign contact ID (bridges to Deals.ProspectId)
    // The acid column cross-references to legacy: acid may equal the legacy ID for paired records.
    // We resolve a paired legacyId/instructionsId so updates persist and don't "revert" when
    // the UI refreshes from the other source.

    const checkMainQuery = `SELECT COUNT(*) as count FROM enquiries WHERE ID = @id`;
    const checkInstructionsQuery = `SELECT COUNT(*) as count FROM enquiries WHERE id = @id`;

    let legacyIdToUpdate = displayEnquiryId || enquiryId;
    let instructionsIdToUpdate = explicitProcessingEnquiryId || displayEnquiryId || enquiryId;
    let mainCount = 0;
    let instructionsCount = 0;

    const resolveInstructionsPairFromLegacyId = async (legacyCandidateId) => {
      if (!legacyCandidateId) return;
      try {
        const pairResult = await withRequest(instructionsConnectionString, async (request) => {
          request.input('acid', sql.VarChar(50), legacyCandidateId);
          return await request.query(`SELECT TOP 1 id FROM enquiries WHERE acid = @acid`);
        });
        const pairedInstructionsId = pairResult.recordset?.[0]?.id;
        if (pairedInstructionsId) {
          instructionsIdToUpdate = String(pairedInstructionsId);
          instructionsCount = 1;
        }
      } catch (pairErr) {
        log.warn('Failed to resolve paired instructions enquiry via acid (legacy ID):', pairErr?.message);
      }
    };

    const resolveLegacyPairFromInstructionsId = async (instructionsCandidateId) => {
      if (!instructionsCandidateId) return;
      try {
        const acidResult = await withRequest(instructionsConnectionString, async (request) => {
          request.input('id', sql.VarChar(50), instructionsCandidateId);
          return await request.query(`SELECT TOP 1 acid FROM enquiries WHERE id = @id`);
        });
        const pairedLegacyId = acidResult.recordset?.[0]?.acid;
        if (pairedLegacyId) {
          legacyIdToUpdate = String(pairedLegacyId);
          const legacyCheck = await withRequest(mainConnectionString, async (request) => {
            request.input('id', sql.VarChar(50), legacyIdToUpdate);
            return await request.query(checkMainQuery);
          });
          mainCount = legacyCheck.recordset[0]?.count || 0;
        }
      } catch (pairErr) {
        log.warn('Failed to resolve paired legacy enquiry via acid (instructions ID):', pairErr?.message);
      }
    };

    if (normalisedProcessingSource === 'new' && explicitProcessingEnquiryId) {
      instructionsIdToUpdate = explicitProcessingEnquiryId;
      const instructionsResult = await withRequest(instructionsConnectionString, async (request) => {
        request.input('id', sql.VarChar(50), instructionsIdToUpdate);
        return await request.query(checkInstructionsQuery);
      });
      instructionsCount = instructionsResult.recordset[0]?.count || 0;

      await resolveLegacyPairFromInstructionsId(instructionsIdToUpdate);
    } else if (normalisedProcessingSource === 'legacy' && explicitProcessingEnquiryId) {
      legacyIdToUpdate = explicitProcessingEnquiryId;
      const mainResult = await withRequest(mainConnectionString, async (request) => {
        request.input('id', sql.VarChar(50), legacyIdToUpdate);
        return await request.query(checkMainQuery);
      });
      mainCount = mainResult.recordset[0]?.count || 0;

      await resolveInstructionsPairFromLegacyId(legacyIdToUpdate);
    } else {
      const mainResult = await withRequest(mainConnectionString, async (request) => {
        request.input('id', sql.VarChar(50), enquiryId);
        return await request.query(checkMainQuery);
      });
      mainCount = mainResult.recordset[0]?.count || 0;

      const instructionsResult = await withRequest(instructionsConnectionString, async (request) => {
        request.input('id', sql.VarChar(50), enquiryId);
        return await request.query(checkInstructionsQuery);
      });
      instructionsCount = instructionsResult.recordset[0]?.count || 0;

      if (mainCount > 0 && instructionsCount === 0) {
        await resolveInstructionsPairFromLegacyId(enquiryId);
      }

      if (instructionsCount > 0 && mainCount === 0) {
        await resolveLegacyPairFromInstructionsId(enquiryId);
      }
    }

    if (mainCount === 0 && instructionsCount === 0) {
      return res.status(404).json({ error: 'Enquiry not found in either database' });
    }

    const updatedTables = { main: false, instructions: false };

    // Update legacy database if enquiry exists there
    if (mainCount > 0) {
      await withRequest(mainConnectionString, async (request) => {
        const setClause = [];
        request.input('id', sql.VarChar(50), legacyIdToUpdate);

        if (updates.First_Name !== undefined) {
          setClause.push('First_Name = @firstName');
          request.input('firstName', sql.VarChar(100), updates.First_Name);
        }
        if (updates.Last_Name !== undefined) {
          setClause.push('Last_Name = @lastName');
          request.input('lastName', sql.VarChar(100), updates.Last_Name);
        }
        if (updates.Email !== undefined) {
          setClause.push('Email = @email');
          request.input('email', sql.VarChar(255), updates.Email);
        }
        if (updates.Value !== undefined) {
          setClause.push('Value = @value');
          request.input('value', sql.VarChar(100), updates.Value);
        }
        if (updates.Initial_first_call_notes !== undefined) {
          setClause.push('Initial_first_call_notes = @notes');
          request.input('notes', sql.Text, updates.Initial_first_call_notes);
        }
        if (updates.Area_of_Work !== undefined) {
          setClause.push('Area_of_Work = @areaOfWork');
          request.input('areaOfWork', sql.VarChar(100), updates.Area_of_Work);
        }
        if (updates.Rating !== undefined) {
          setClause.push('Rating = @rating');
          request.input('rating', sql.VarChar(50), updates.Rating);
        }

        if (updates.Point_of_Contact !== undefined) {
          setClause.push('Point_of_Contact = @pointOfContact');
          request.input('pointOfContact', sql.VarChar(255), updates.Point_of_Contact);
        }

        if (setClause.length > 0) {
          const updateQuery = `UPDATE enquiries SET ${setClause.join(', ')} WHERE ID = @id`;
          await request.query(updateQuery);
          updatedTables.main = true;
        }
      });
    }

    // Update instructions database if enquiry exists there (using lowercase field names)
    if (instructionsCount > 0) {
      await withRequest(instructionsConnectionString, async (request) => {
        const setClause = [];
        request.input('id', sql.VarChar(50), instructionsIdToUpdate);

        // Map to lowercase field names used in instructions database
        if (updates.First_Name !== undefined) {
          setClause.push('first = @first');
          request.input('first', sql.VarChar(100), updates.First_Name);
        }
        if (updates.Last_Name !== undefined) {
          setClause.push('last = @last');
          request.input('last', sql.VarChar(100), updates.Last_Name);
        }
        if (updates.Email !== undefined) {
          setClause.push('email = @email');
          request.input('email', sql.VarChar(255), updates.Email);
        }
        if (updates.Value !== undefined) {
          setClause.push('value = @value');
          request.input('value', sql.VarChar(100), updates.Value);
        }
        if (updates.Initial_first_call_notes !== undefined) {
          setClause.push('notes = @notes');
          request.input('notes', sql.Text, updates.Initial_first_call_notes);
        }
        if (updates.Area_of_Work !== undefined) {
          setClause.push('aow = @aow');
          request.input('aow', sql.VarChar(100), updates.Area_of_Work);
        }
        if (updates.Rating !== undefined) {
          setClause.push('rating = @rating');
          request.input('rating', sql.VarChar(50), updates.Rating);
        }

        if (updates.Point_of_Contact !== undefined) {
          setClause.push('poc = @poc');
          request.input('poc', sql.VarChar(255), updates.Point_of_Contact);
        }

        const sharedWithUpdateValue = updates.Shared_With ?? updates.shared_with;
        if (sharedWithUpdateValue !== undefined && hasInstructionsSharedWithColumn) {
          setClause.push('shared_with = @sharedWith');
          request.input('sharedWith', sql.NVarChar(1000), serialiseSharedWithEmails(sharedWithUpdateValue));
        }

        if (setClause.length > 0) {
          const updateQuery = `UPDATE enquiries SET ${setClause.join(', ')} WHERE id = @id`;
          await request.query(updateQuery);
          updatedTables.instructions = true;
        }
      });
    }

    // Invalidate all unified enquiries cache entries after successful update
    try {
      clearUnifiedMemoryCache();
      // New correct pattern (matches cacheUnified which uses type 'data')
      const deletedData = await deleteCachePattern(`${CACHE_CONFIG.PREFIXES.UNIFIED}:data:*`);
      // Backward compatibility: also clear any older keys using 'enquiries' type
      const deletedEnquiries = await deleteCachePattern(`${CACHE_CONFIG.PREFIXES.UNIFIED}:enquiries:*`);
      log.debug(`Invalidated cache after update (data:${deletedData}, enquiries:${deletedEnquiries})`);
    } catch (cacheError) {
      log.warn('Failed to invalidate cache after update:', cacheError?.message);
      // Don't fail the request if cache invalidation fails
    }

    try {
      broadcastEnquiriesChanged({ changeType: 'update', enquiryId: displayEnquiryId || enquiryId });
    } catch { /* non-blocking */ }

    res.status(200).json({
      success: true,
      message: 'Enquiry updated successfully',
      enquiryId: displayEnquiryId || enquiryId,
      updatedTables,
      updatedIds: {
        legacyId: legacyIdToUpdate,
        instructionsId: instructionsIdToUpdate
      }
    });

  } catch (error) {
    log.error('Error updating enquiry:', error?.message);
    res.status(500).json({ error: 'Failed to update enquiry', details: error?.message || 'Unknown error' });
  }
});

// Route: POST /api/enquiries-unified/create
// Create a new enquiry in the instructions database
router.post('/create', async (req, res) => {
  try {
    log.debug('Create enquiry request received');

    const instructionsConnectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    
    if (!instructionsConnectionString) {
      log.error('❌ Instructions database connection string not found');
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    const rawBody = req.body;
    const payload = rawBody && typeof rawBody === 'object' && rawBody !== null && 'data' in rawBody
      ? rawBody.data
      : rawBody;

    if (!payload || typeof payload !== 'object') {
      log.error('❌ Invalid payload structure for create enquiry');
      return res.status(400).json({ error: 'Invalid request payload' });
    }

    const normalise = (value) => typeof value === 'string' ? value.trim() : value;

    const first = normalise(payload.first);
    const last = normalise(payload.last);
    const aow = normalise(payload.aow);
    const moc = normalise(payload.moc);
    const email = normalise(payload.email)?.toLowerCase() || null;
    const phone = normalise(payload.phone) || null;
    const sourceRaw = normalise(payload.source);
    const source = sourceRaw ? sourceRaw.toLowerCase() : 'manual';
    const rep = normalise(payload.rep) || normalise(payload.poc) || null;
    const poc = normalise(payload.poc) || rep;

    if (!first || !last) {
      return res.status(400).json({ error: 'First and last name are required' });
    }

    if (!email && !phone) {
      return res.status(400).json({ error: 'Either email or phone is required' });
    }

    if (!aow) {
      return res.status(400).json({ error: 'Area of work is required' });
    }

    if (!moc) {
      return res.status(400).json({ error: 'Method of contact is required' });
    }

    if (!source) {
      return res.status(400).json({ error: 'Source is required' });
    }

    if (!rep) {
      return res.status(400).json({ error: 'Point of contact is required' });
    }

    const rankValue = payload.rank !== undefined ? Number.parseInt(String(payload.rank), 10) : Number.NaN;

    const pitch = normalise(payload.pitch);
    const tow = normalise(payload.tow);
    const value = normalise(payload.value);
    const notes = normalise(payload.notes);
    const rating = normalise(payload.rating);
    const acid = normalise(payload.acid);
    const cardId = normalise(payload.card_id ?? payload.cardId);
    const url = normalise(payload.url);
    const contactReferrer = normalise(payload.contact_referrer ?? payload.contactReferrer) || null;
    const companyReferrer = normalise(payload.company_referrer ?? payload.companyReferrer) || null;
    const gclid = normalise(payload.gclid);

    const data = {
      stage: normalise(payload.stage) || 'enquiry',
      claim: normalise(payload.claim) || null,
      poc,
      pitch: pitch || null,
      aow,
      tow: tow || null,
      moc,
      rep,
      first,
      last,
      email,
      phone,
      value: value || null,
      notes: notes || null,
      rank: Number.isNaN(rankValue) ? 4 : rankValue,
      rating: rating || null,
      acid: acid || null,
      card_id: cardId || null,
      source,
      url: url || null,
      contact_referrer: contactReferrer,
      company_referrer: companyReferrer,
      gclid: gclid || null,
    };

    // Get current London time
    const londonTime = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/London"}));

    // Build INSERT query with all fields
    const result = await withRequest(instructionsConnectionString, async (request) => {
      // Required fields
      request.input('datetime', sql.DateTime2, londonTime);
  request.input('stage', sql.VarChar(50), data.stage);
  request.input('aow', sql.VarChar(100), data.aow);
  request.input('moc', sql.VarChar(100), data.moc);
  request.input('first', sql.VarChar(100), data.first);
  request.input('last', sql.VarChar(100), data.last);
  request.input('email', sql.VarChar(255), data.email);
  request.input('source', sql.VarChar(100), data.source);

  // Optional fields
  request.input('claim', sql.VarChar(100), data.claim);
  request.input('poc', sql.VarChar(255), data.poc);
  request.input('pitch', sql.VarChar(100), data.pitch);
  request.input('tow', sql.VarChar(100), data.tow);
  request.input('phone', sql.VarChar(50), data.phone);
  request.input('value', sql.VarChar(50), data.value);
  request.input('notes', sql.Text, data.notes);
  request.input('rank', sql.Int, data.rank);
  request.input('rating', sql.VarChar(50), data.rating);
  request.input('acid', sql.VarChar(50), data.acid);
  request.input('card_id', sql.VarChar(50), data.card_id);
  request.input('url', sql.VarChar(500), data.url);
  request.input('contact_referrer', sql.VarChar(100), data.contact_referrer);
  request.input('company_referrer', sql.VarChar(100), data.company_referrer);
  request.input('gclid', sql.VarChar(100), data.gclid);
  request.input('rep', sql.VarChar(255), data.rep);

      const insertQuery = `
        INSERT INTO dbo.enquiries (
          datetime, stage, claim, poc, pitch, aow, tow, moc, rep,
          first, last, email, phone, value, notes, rank, rating,
          acid, card_id, source, url, contact_referrer, company_referrer, gclid
        ) VALUES (
          @datetime, @stage, @claim, @poc, @pitch, @aow, @tow, @moc, @rep,
          @first, @last, @email, @phone, @value, @notes, @rank, @rating,
          @acid, @card_id, @source, @url, @contact_referrer, @company_referrer, @gclid
        );
        SELECT SCOPE_IDENTITY() AS id;
      `;

      return await request.query(insertQuery);
    });

    const newId = result.recordset[0]?.id;

    log.info(`✅ Enquiry created successfully with ID: ${newId}`);

    // Invalidate cache after successful insert
    try {
      clearUnifiedMemoryCache();
      // New correct pattern (matches cacheUnified which uses type 'data')
      const deletedData = await deleteCachePattern(`${CACHE_CONFIG.PREFIXES.UNIFIED}:data:*`);
      // Backward compatibility: also clear any older keys using 'enquiries' type
      const deletedEnquiries = await deleteCachePattern(`${CACHE_CONFIG.PREFIXES.UNIFIED}:enquiries:*`);
      log.info(`🗑️  Invalidated cache after create (data:${deletedData}, enquiries:${deletedEnquiries})`);
    } catch (cacheError) {
      log.warn('⚠️  Failed to invalidate cache after create:', cacheError);
    }

    try {
      broadcastEnquiriesChanged({ changeType: 'create', enquiryId: String(newId) });
    } catch { /* non-blocking */ }

    res.status(201).json({
      success: true,
      id: newId,
      message: 'Enquiry created successfully'
    });

  } catch (error) {
    log.error('❌ Error creating enquiry:', error);
    res.status(500).json({ 
      error: 'Failed to create enquiry', 
      details: error?.message || 'Unknown error' 
    });
  }
});

// Route: DELETE /api/enquiries-unified/:id
// Delete a specific enquiry by ID from both systems
router.delete('/:id', async (req, res) => {
  try {
    const enquiryId = String(req.params.id || '').trim();
    const explicitProcessingEnquiryId = String(req.query.processingEnquiryId || '').trim();
    const normalisedProcessingSource = String(req.query.processingSource || '').trim().toLowerCase();
    
    log.info('🗑️  Delete request for enquiry ID:', enquiryId, {
      processingEnquiryId: explicitProcessingEnquiryId,
      processingSource: normalisedProcessingSource,
    });

    if (!enquiryId) {
      return res.status(400).json({ error: 'Enquiry ID is required' });
    }

    const results = {
      v1Deleted: false,
      v2Deleted: false,
      teamsActivityDeleted: 0,
      deletedRecord: null
    };

    // Use the same connection strings as other operations
    const mainConnectionString = process.env.SQL_CONNECTION_STRING;
    const instructionsConnectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;

    if (!mainConnectionString || !instructionsConnectionString) {
      return res.status(500).json({ error: 'Database connection strings not configured' });
    }

    const checkMainQuery = `SELECT COUNT(*) as count FROM enquiries WHERE ID = @id`;
    const checkInstructionsQuery = `SELECT COUNT(*) as count FROM enquiries WHERE id = @id`;

    let legacyIdToDelete = enquiryId;
    let instructionsIdToDelete = explicitProcessingEnquiryId || enquiryId;
    let mainCount = 0;
    let instructionsCount = 0;

    const resolveInstructionsPairFromLegacyId = async (legacyCandidateId) => {
      if (!legacyCandidateId) return;
      try {
        const pairResult = await withRequest(instructionsConnectionString, async (request) => {
          request.input('acid', sql.VarChar(50), legacyCandidateId);
          return await request.query(`SELECT TOP 1 id FROM enquiries WHERE acid = @acid`);
        });
        const pairedInstructionsId = pairResult.recordset?.[0]?.id;
        if (pairedInstructionsId) {
          instructionsIdToDelete = String(pairedInstructionsId);
          instructionsCount = 1;
        }
      } catch (pairErr) {
        log.warn('Failed to resolve paired instructions enquiry via acid (legacy ID):', pairErr?.message);
      }
    };

    const resolveLegacyPairFromInstructionsId = async (instructionsCandidateId) => {
      if (!instructionsCandidateId) return;
      try {
        const acidResult = await withRequest(instructionsConnectionString, async (request) => {
          request.input('id', sql.VarChar(50), instructionsCandidateId);
          return await request.query(`SELECT TOP 1 acid FROM enquiries WHERE id = @id`);
        });
        const pairedLegacyId = acidResult.recordset?.[0]?.acid;
        if (pairedLegacyId) {
          legacyIdToDelete = String(pairedLegacyId);
          const legacyCheck = await withRequest(mainConnectionString, async (request) => {
            request.input('id', sql.VarChar(50), legacyIdToDelete);
            return await request.query(checkMainQuery);
          });
          mainCount = legacyCheck.recordset[0]?.count || 0;
        }
      } catch (pairErr) {
        log.warn('Failed to resolve paired legacy enquiry via acid (instructions ID):', pairErr?.message);
      }
    };

    if (normalisedProcessingSource === 'new' && explicitProcessingEnquiryId) {
      instructionsIdToDelete = explicitProcessingEnquiryId;
      const instructionsResult = await withRequest(instructionsConnectionString, async (request) => {
        request.input('id', sql.VarChar(50), instructionsIdToDelete);
        return await request.query(checkInstructionsQuery);
      });
      instructionsCount = instructionsResult.recordset[0]?.count || 0;
      await resolveLegacyPairFromInstructionsId(instructionsIdToDelete);
    } else if (normalisedProcessingSource === 'legacy' && explicitProcessingEnquiryId) {
      legacyIdToDelete = explicitProcessingEnquiryId;
      const mainResult = await withRequest(mainConnectionString, async (request) => {
        request.input('id', sql.VarChar(50), legacyIdToDelete);
        return await request.query(checkMainQuery);
      });
      mainCount = mainResult.recordset[0]?.count || 0;
      await resolveInstructionsPairFromLegacyId(legacyIdToDelete);
    } else {
      const mainResult = await withRequest(mainConnectionString, async (request) => {
        request.input('id', sql.VarChar(50), enquiryId);
        return await request.query(checkMainQuery);
      });
      mainCount = mainResult.recordset[0]?.count || 0;

      const instructionsResult = await withRequest(instructionsConnectionString, async (request) => {
        request.input('id', sql.VarChar(50), instructionsIdToDelete);
        return await request.query(checkInstructionsQuery);
      });
      instructionsCount = instructionsResult.recordset[0]?.count || 0;

      if (mainCount > 0 && instructionsCount === 0) {
        await resolveInstructionsPairFromLegacyId(enquiryId);
      }

      if (instructionsCount > 0 && mainCount === 0) {
        await resolveLegacyPairFromInstructionsId(instructionsIdToDelete);
      }
    }

    // First, clean up any Teams activities that reference this enquiry (to avoid FK constraints)
    try {
      const teamsActivityDeleted = await withRequest(instructionsConnectionString, async (request) => {
        // Find Teams activities for this enquiry
        request.input('enquiryId', sql.VarChar(50), String(instructionsIdToDelete));
        const selectResult = await request.query(`
          SELECT Id, EnquiryId, LeadName, Email
          FROM TeamsBotActivityTracking
          WHERE CAST(EnquiryId AS VARCHAR(50)) = @enquiryId
        `);
        
        const activitiesToDelete = selectResult.recordset || [];
        
        // Delete each activity
        for (const activity of activitiesToDelete) {
          const deleteRequest = await withRequest(instructionsConnectionString, async (deleteReq) => {
            deleteReq.input('activityId', sql.Int, activity.Id);
            return await deleteReq.query('DELETE FROM TeamsBotActivityTracking WHERE Id = @activityId');
          });
        }
        
        return activitiesToDelete.length;
      });
      
      results.teamsActivityDeleted = teamsActivityDeleted;
      if (teamsActivityDeleted > 0) {
        log.info(`🗑️  Deleted ${teamsActivityDeleted} Teams activities for enquiry ${instructionsIdToDelete}`);
      }
    } catch (teamsError) {
      log.warn('⚠️  Failed to clean up Teams activities:', teamsError.message);
    }

    // Try to delete from v1 database (main/helix-core-data system)
    try {
      const v1Result = await withRequest(mainConnectionString, async (request) => {
        // First get the record details before deleting
        request.input('id', sql.VarChar(50), String(legacyIdToDelete));
        const selectResult = await request.query(`
          SELECT ID, First_Name, Last_Name, Email, Point_of_Contact
          FROM enquiries
          WHERE ID = @id
        `);
        
        if (selectResult.recordset && selectResult.recordset.length > 0) {
          const record = selectResult.recordset[0];
          
          // Delete the record
          const deleteResult = await request.query(`
            DELETE FROM enquiries WHERE ID = @id
          `);
          
          if (deleteResult.rowsAffected && deleteResult.rowsAffected[0] > 0) {
            results.v1Deleted = true;
            results.deletedRecord = {
              system: 'v1',
              id: record.ID,
              name: `${record.First_Name || ''} ${record.Last_Name || ''}`.trim(),
              email: record.Email || '',
              poc: record.Point_of_Contact || ''
            };
            log.info(`✅ Deleted v1 record: ${results.deletedRecord.name} (${results.deletedRecord.email})`);
          }
        }
      });
    } catch (v1Error) {
      log.warn(`⚠️  Could not delete from v1 database:`, v1Error.message);
    }

    // Try to delete from v2 database (instructions system)
    try {
      const v2Result = await withRequest(instructionsConnectionString, async (request) => {
        // Check if ID is numeric for v2 database
        const numericId = parseInt(instructionsIdToDelete, 10);
        if (isNaN(numericId)) {
          return; // Skip v2 if ID is not numeric
        }
        
        // First get the record details before deleting
        request.input('id', sql.Int, numericId);
        const selectResult = await request.query(`
          SELECT id, first, last, email, poc
          FROM enquiries
          WHERE id = @id
        `);
        
        if (selectResult.recordset && selectResult.recordset.length > 0) {
          const record = selectResult.recordset[0];
          
          // Delete the record
          const deleteResult = await request.query(`
            DELETE FROM enquiries WHERE id = @id
          `);
          
          if (deleteResult.rowsAffected && deleteResult.rowsAffected[0] > 0) {
            results.v2Deleted = true;
            if (!results.deletedRecord) {
              results.deletedRecord = {
                system: 'v2',
                id: record.id,
                name: `${record.first || ''} ${record.last || ''}`.trim(),
                email: record.email || '',
                poc: record.poc || ''
              };
            }
            log.info(`✅ Deleted v2 record: ${results.deletedRecord.name} (${results.deletedRecord.email})`);
          }
        }
      });
    } catch (v2Error) {
      log.warn(`⚠️  Could not delete from v2 database:`, v2Error.message);
    }

    // Check if anything was actually deleted
    if (!results.v1Deleted && !results.v2Deleted) {
      return res.status(404).json({ 
        error: 'Enquiry not found', 
        message: `No enquiry found with ID: ${enquiryId}` 
      });
    }

    // Clear cache after deletion
    try {
      clearUnifiedMemoryCache();
      await deleteCachePattern(`${CACHE_CONFIG.PREFIXES.UNIFIED}:*`);
      log.info('🗑️  Cache cleared after deletion');
    } catch (cacheError) {
      log.warn('⚠️  Failed to clear cache after deletion:', cacheError);
    }

    const message = `Successfully deleted enquiry ${enquiryId}` + 
                   (results.v1Deleted ? ' from v1' : '') + 
                   (results.v1Deleted && results.v2Deleted ? ' and' : '') +
                   (results.v2Deleted ? ' from v2' : '') +
                   (results.teamsActivityDeleted > 0 ? ` (+ ${results.teamsActivityDeleted} Teams activities)` : '');

    log.info('✅', message);

    try {
      broadcastEnquiriesChanged({ changeType: 'delete', enquiryId: String(enquiryId) });
    } catch { /* non-blocking */ }

    res.json({
      success: true,
      message,
      results,
      deletedIds: {
        displayId: enquiryId,
        legacyId: legacyIdToDelete,
        instructionsId: instructionsIdToDelete,
      },
    });

  } catch (error) {
    log.error('❌ Error during deletion:', error);
    res.status(500).json({ 
      error: 'Deletion failed', 
      details: error?.message || 'Unknown error' 
    });
  }
});

// Route: DELETE /api/enquiries-unified/cleanup
// Remove test data and specific enquiry IDs from both systems
router.delete('/cleanup', async (req, res) => {
  try {
    const { 
      testPattern = 'TestPattern', 
      specificIds = [], 
      dryRun = true, // Default to dry run for safety
      removeTeamsActivity = false 
    } = req.body;

    log.info('🧹 Cleanup request received:', { testPattern, specificIds, dryRun, removeTeamsActivity });

    if (!testPattern && specificIds.length === 0) {
      return res.status(400).json({
        error: 'Must provide either testPattern or specificIds for cleanup'
      });
    }

    const results = {
      v1Deleted: 0,
      v2Deleted: 0,
      teamsActivityDeleted: 0,
      deletedIds: [],
      dryRun
    };

    // Use the same connection strings as the main query
    const mainConnectionString = process.env.SQL_CONNECTION_STRING; // helix-core-data
    const instructionsConnectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING; // instructions DB

    if (!mainConnectionString || !instructionsConnectionString) {
      return res.status(500).json({ error: 'Database connection strings not configured' });
    }

    // Teams Activity Cleanup FIRST (if requested) - MUST be done first due to FK constraints
    if (removeTeamsActivity && (testPattern || specificIds.length > 0)) {
      const teamsActivityDeleted = await withRequest(instructionsConnectionString, async (request) => {
        let query = `
          SELECT TOP 100 Id, EnquiryId, LeadName, Email
          FROM TeamsBotActivityTracking
          WHERE Status = 'active'
        `;
        
        if (testPattern) {
          request.input('testPattern', sql.NVarChar, `%${testPattern}%`);
          query += ` AND (
            (LeadName LIKE @testPattern AND LeadName LIKE @testPattern)
            OR Email LIKE '%test@%'
            OR Email LIKE '%example.com'
            OR Email LIKE '%dummy@%'
            OR Email LIKE '%@test.com'
          )`;
        }
        
        if (specificIds.length > 0) {
          const idParams = specificIds.map((id, idx) => {
            // Handle mixed ID types - some are strings, some are numbers
            const paramName = `enquiryId${idx}`;
            if (isNaN(id)) {
              // String ID
              request.input(paramName, sql.VarChar(50), String(id));
            } else {
              // Numeric ID  
              request.input(paramName, sql.Int, parseInt(id, 10));
            }
            return `@${paramName}`;
          }).join(', ');
          query += ` OR CAST(EnquiryId AS VARCHAR(50)) IN (${idParams})`;
        }

        // Get records to delete first
        const selectResult = await request.query(query);
        const recordsToDelete = selectResult.recordset || [];
        
        if (!dryRun && recordsToDelete.length > 0) {
          // Actually delete the records
          for (const record of recordsToDelete) {
            const deleteResult = await withRequest(instructionsConnectionString, async (deleteRequest) => {
              deleteRequest.input('recordId', sql.Int, record.Id);
              return await deleteRequest.query('DELETE FROM TeamsBotActivityTracking WHERE Id = @recordId');
            });
          }
        }

        return recordsToDelete;
      });

      results.teamsActivityDeleted = teamsActivityDeleted.length;
    }

    // V1 Database Cleanup (Main/helix-core-data system) - same as main query
    if (testPattern || specificIds.length > 0) {
      const v1DeletedIds = await withRequest(mainConnectionString, async (request) => {
        let query = `
          SELECT TOP 100 ID, First_Name, Last_Name, Email, Point_of_Contact
          FROM enquiries
          WHERE 1=1
        `;
        
        if (testPattern) {
          request.input('testPattern', sql.NVarChar, `%${testPattern}%`);
          query += ` AND (
            (First_Name LIKE @testPattern AND Last_Name LIKE @testPattern)
            OR Email LIKE '%test@%'
            OR Email LIKE '%example.com'
            OR Email LIKE '%dummy@%'
            OR Email LIKE '%@test.com'
            OR ID LIKE 'TEST-%'
            OR ID LIKE 'ENQ%test%'
            OR (First_Name = 'Test' OR Last_Name = 'Test')
          )`;
        }
        
        if (specificIds.length > 0) {
          const idParams = specificIds.map((id, idx) => {
            request.input(`id${idx}`, sql.Int, parseInt(id, 10));
            return `@id${idx}`;
          }).join(', ');
          query += ` OR ID IN (${idParams})`;
        }

        // Get records to delete first
        const selectResult = await request.query(query);
        const recordsToDelete = selectResult.recordset || [];
        
        if (!dryRun && recordsToDelete.length > 0) {
          // Actually delete the records using safe parameterized approach
          for (const record of recordsToDelete) {
            const deleteResult = await withRequest(mainConnectionString, async (deleteRequest) => {
              deleteRequest.input('recordId', sql.VarChar(50), String(record.ID));
              return await deleteRequest.query('DELETE FROM enquiries WHERE ID = @recordId');
            });
          }
        }

        return recordsToDelete;
      });

      results.v1Deleted = v1DeletedIds.length;
      results.deletedIds.push(...v1DeletedIds.map(r => ({ 
        system: 'v1', 
        id: r.ID, 
        name: `${r.First_Name || ''} ${r.Last_Name || ''}`.trim(), 
        email: r.Email || '',
        poc: r.Point_of_Contact || ''
      })));
    }

    // V2 Database Cleanup (Instructions system)
    if (testPattern || specificIds.length > 0) {
      const v2DeletedIds = await withRequest(instructionsConnectionString, async (request) => {
        let query = `
          SELECT TOP 100 id, first, last, email, poc
          FROM enquiries
          WHERE 1=1
        `;
        
        if (testPattern) {
          request.input('testPattern', sql.NVarChar, `%${testPattern}%`);
          query += ` AND (
            (first LIKE @testPattern AND last LIKE @testPattern)
            OR email LIKE '%test@%'
            OR email LIKE '%example.com'
            OR email LIKE '%dummy@%'
            OR email LIKE '%@test.com'
            OR (first = 'Test' OR last = 'Test')
          )`;
        }
        
        if (specificIds.length > 0) {
          const idParams = specificIds.map((id, idx) => {
            request.input(`id${idx}`, sql.Int, parseInt(id, 10));
            return `@id${idx}`;
          }).join(', ');
          query += ` OR id IN (${idParams})`;
        }

        // Get records to delete first
        const selectResult = await request.query(query);
        const recordsToDelete = selectResult.recordset || [];
        
        if (!dryRun && recordsToDelete.length > 0) {
          // Actually delete the records using safe approach
          for (const record of recordsToDelete) {
            const deleteResult = await withRequest(instructionsConnectionString, async (deleteRequest) => {
              deleteRequest.input('recordId', sql.Int, record.id);
              return await deleteRequest.query('DELETE FROM enquiries WHERE id = @recordId');
            });
          }
        }

        return recordsToDelete;
      });

      results.v2Deleted = v2DeletedIds.length;
      results.deletedIds.push(...v2DeletedIds.map(r => ({ 
        system: 'v2', 
        id: r.id, 
        name: `${r.first || ''} ${r.last || ''}`.trim(), 
        email: r.email || '',
        poc: r.poc || ''
      })));
    }

    // Clear cache after cleanup
    if (!dryRun && (results.v1Deleted > 0 || results.v2Deleted > 0)) {
      try {
        clearUnifiedMemoryCache();
        await deleteCachePattern(`${CACHE_CONFIG.PREFIXES.UNIFIED}:*`);
        log.info('🗑️  Cache cleared after cleanup');
      } catch (cacheError) {
        log.warn('⚠️  Failed to clear cache after cleanup:', cacheError);
      }
    }

    const message = dryRun 
      ? `Dry run: Would delete ${results.v1Deleted} v1 + ${results.v2Deleted} v2 records${removeTeamsActivity ? ` + ${results.teamsActivityDeleted} Teams activities` : ''}` 
      : `Successfully deleted ${results.v1Deleted} v1 + ${results.v2Deleted} v2 records${removeTeamsActivity ? ` + ${results.teamsActivityDeleted} Teams activities` : ''}`;

    log.info('✅', message);

    try {
      broadcastEnquiriesChanged({ changeType: 'cleanup' });
    } catch { /* non-blocking */ }

    res.json({
      success: true,
      message,
      results
    });

  } catch (error) {
    log.error('❌ Error during cleanup:', error);
    res.status(500).json({ 
      error: 'Cleanup failed', 
      details: error?.message || 'Unknown error' 
    });
  }
});

module.exports = router;

