const express = require('express');
const { withRequest, sql } = require('../utils/db');
const { cacheUnified, generateCacheKey, CACHE_CONFIG, deleteCachePattern } = require('../utils/redisClient');
const router = express.Router();

// Route: GET /api/enquiries-unified
// Direct database connections to fetch enquiries from BOTH database sources
router.get('/', async (req, res) => {
  try {
    console.log('📊 Unified enquiries route called');

    // Parse query parameters for filtering and pagination
    const limit = Math.min(parseInt(req.query.limit, 10) || 1000, 2500); // Default 1000, max 2500
    const email = (req.query.email || '').trim().toLowerCase();
    const initials = (req.query.initials || '').trim().toLowerCase();
    const includeTeamInbox = String(req.query.includeTeamInbox || 'true').toLowerCase() === 'true';
    const fetchAll = String(req.query.fetchAll || 'false').toLowerCase() === 'true';
    const dateFrom = req.query.dateFrom || '';
    const dateTo = req.query.dateTo || '';
    const bypassCache = String(req.query.bypassCache || 'false').toLowerCase() === 'true';
    
    console.log('🔍 bypassCache parameter:', bypassCache, '(raw:', req.query.bypassCache, ')');

    // Generate cache key based on query parameters
    const cacheParams = [
      limit,
      email,
      initials,
      includeTeamInbox,
      fetchAll,
      dateFrom,
      dateTo
    ].filter(p => p !== '' && p !== null && p !== undefined);

    const cacheKey = generateCacheKey(
      CACHE_CONFIG.PREFIXES.UNIFIED,
      'enquiries',
      ...cacheParams
    );

    // Use Redis cache wrapper if not bypassed
    if (!bypassCache) {
      const result = await cacheUnified([cacheKey], async () => {
        return await performUnifiedEnquiriesQuery(req.query);
      });
      return res.json(result);
    }

    // Bypass cache - direct query
    const result = await performUnifiedEnquiriesQuery(req.query);
    res.json({ ...result, cached: false });

  } catch (error) {
    console.error('❌ Error in enquiries-unified route:', error);
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
  console.log('🔍 Performing fresh unified enquiries query');

  const limit = Math.min(parseInt(queryParams.limit, 10) || 1000, 2500);
  const email = (queryParams.email || '').trim().toLowerCase();
  const initials = (queryParams.initials || '').trim().toLowerCase();
  const includeTeamInbox = String(queryParams.includeTeamInbox || 'true').toLowerCase() === 'true';
  const fetchAll = String(queryParams.fetchAll || 'false').toLowerCase() === 'true';
  const dateFrom = queryParams.dateFrom || '';
  const dateTo = queryParams.dateTo || '';

  // Connection strings for both databases
  const mainConnectionString = process.env.SQL_CONNECTION_STRING; // helix-core-data
  const instructionsConnectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING; // instructions DB

  if (!mainConnectionString || !instructionsConnectionString) {
    console.error('❌ Required connection strings not found in environment');
    throw new Error('Database configuration missing');
  }

  // Collect warnings and debug info
  const warnings = [];

  // Main DB query
  let mainEnquiries = [];
  let mainWhereClause = '';
  try {
    const result = await withRequest(mainConnectionString, async (request) => {
      const filters = [];

      if (dateFrom) {
        request.input('dateFrom', sql.DateTime2, new Date(dateFrom));
        filters.push('Date_Created >= @dateFrom');
      }
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        request.input('dateTo', sql.DateTime2, endDate);
        filters.push('Date_Created <= @dateTo');
      }

      // User filtering (unless fetchAll is true)
      if (!fetchAll && (email || initials)) {
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
          Value as claim,
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
          'main' as source,
          'not-checked' as migrationStatus
        FROM enquiries
        ${mainWhereClause}
        ORDER BY Date_Created DESC
      `);
    });
    mainEnquiries = Array.isArray(result.recordset) ? result.recordset : [];
  } catch (err) {
    console.error('❌ Main DB enquiries query failed:', err?.message || err);
    warnings.push({ source: 'main', message: err?.message || String(err) });
    mainEnquiries = [];
  }

  // Instructions DB query
  let instructionsEnquiries = [];
  let instWhereClause = '';
  try {
    const result = await withRequest(instructionsConnectionString, async (request) => {
      const filters = [];
      if (dateFrom) {
        request.input('dateFrom', sql.DateTime2, new Date(dateFrom));
        filters.push('datetime >= @dateFrom');
      }
      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        request.input('dateTo', sql.DateTime2, endDate);
        filters.push('datetime <= @dateTo');
      }
      if (!fetchAll && (email || initials)) {
        const pocConditions = [];
        if (email) {
          request.input('userEmail', sql.VarChar(255), email);
          pocConditions.push("LOWER(LTRIM(RTRIM(poc))) = @userEmail");
        }
        if (initials) {
          request.input('userInitials', sql.VarChar(50), initials.replace(/\./g, ''));
          pocConditions.push("LOWER(REPLACE(REPLACE(LTRIM(RTRIM(poc)), ' ', ''), '.', '')) = @userInitials");
        }
        if (includeTeamInbox) {
          pocConditions.push("LOWER(LTRIM(RTRIM(poc))) IN ('team@helix-law.com', 'team', 'team inbox')");
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
          NULL as uid,
          NULL as displayNumber,
          NULL as postcode,
          notes,
          NULL as convertDate,
          'instructions' as source,
          'not-checked' as migrationStatus
        FROM dbo.enquiries
        ${instWhereClause}
        ORDER BY datetime DESC
      `);
    });
    instructionsEnquiries = Array.isArray(result.recordset) ? result.recordset : [];
  } catch (err) {
    console.error('❌ Instructions DB enquiries query failed:', err?.message || err);
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
  
  // FALLBACK: Match by email/phone for records not yet cross-referenced
  mainEnquiries.forEach(mainEnq => {
    if (mainEnq.migrationStatus === 'not-checked' && (mainEnq.email || mainEnq.phone)) {
      const match = instructionsEnquiries.find(inst => inst.migrationStatus === 'not-checked' && (
        (mainEnq.email && inst.email && mainEnq.email.toLowerCase() === inst.email.toLowerCase()) ||
        (mainEnq.phone && inst.phone && mainEnq.phone === inst.phone)
      ));
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
    matchedInstructionIds.add(String(instId));
  }

  const uniqueEnquiries = [];
  const seenIds = new Set();

  // Prefer legacy: add all legacy records first (POC-aware composite key)
  mainEnquiries.forEach(enquiry => {
    const pocLower = (enquiry.poc || '').toString().trim().toLowerCase();
    const compositeKey = `main-${enquiry.id}-${pocLower}`;
    if (!seenIds.has(compositeKey)) {
      seenIds.add(compositeKey);
      uniqueEnquiries.push(enquiry);
    }
  });

  // Then add instructions records that do NOT match any legacy record (not in matchedInstructionIds)
  instructionsEnquiries.forEach(enquiry => {
    const isMatchedToLegacy = matchedInstructionIds.has(String(enquiry.id));
    if (isMatchedToLegacy) return; // suppress new when a legacy counterpart exists
    const compositeKey = `instructions-${enquiry.id}`;
    if (!seenIds.has(compositeKey)) {
      seenIds.add(compositeKey);
      uniqueEnquiries.push(enquiry);
    }
  });

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
      instWhereClause
    },
    migration: {
      ...migrationStats,
      migrationRate: `${migrationRate}%`,
      crossReferenceMap: Object.fromEntries(crossReferenceMap)
    }
  };

  const payloadSize = JSON.stringify(responsePayload).length;
  const payloadMB = (payloadSize / 1024 / 1024).toFixed(2);
  console.log(`📦 Response: ${uniqueEnquiries.length} enquiries, ${payloadMB}MB payload`);

  return responsePayload;
}

// (removed corrupted duplicate POST /update route)

// Route: POST /api/enquiries-unified/update
// Update enquiry fields in BOTH databases (legacy and new instructions)
router.post('/update', async (req, res) => {
  const { ID, ...updates } = req.body;

  console.log('📝 Update request received:', { ID, IDType: typeof ID, updates });

  if (!ID) return res.status(400).json({ error: 'Enquiry ID is required' });
  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'No updates provided' });

  // Ensure ID is a string
  const enquiryId = String(ID);

  try {
    const mainConnectionString = process.env.SQL_CONNECTION_STRING;
    const instructionsConnectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    
    if (!mainConnectionString || !instructionsConnectionString) {
      console.error('❌ Database connection strings not found in environment');
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    // Check which database(s) contain this enquiry
    const checkMainQuery = `SELECT COUNT(*) as count FROM enquiries WHERE ID = @id`;
    const mainResult = await withRequest(mainConnectionString, async (request) => {
      request.input('id', sql.VarChar(50), enquiryId);
      return await request.query(checkMainQuery);
    });
    const mainCount = mainResult.recordset[0]?.count || 0;
    
    // Check new instructions database (using lowercase 'id' field)
    const checkInstructionsQuery = `SELECT COUNT(*) as count FROM enquiries WHERE id = @id`;
    const instructionsResult = await withRequest(instructionsConnectionString, async (request) => {
      request.input('id', sql.VarChar(50), enquiryId);
      return await request.query(checkInstructionsQuery);
    });
    const instructionsCount = instructionsResult.recordset[0]?.count || 0;
    
    if (mainCount === 0 && instructionsCount === 0) {
      return res.status(404).json({ error: 'Enquiry not found in either database' });
    }

    const updatedTables = { main: false, instructions: false };

    // Update legacy database if enquiry exists there
    if (mainCount > 0) {
      await withRequest(mainConnectionString, async (request) => {
        const setClause = [];
        request.input('id', sql.VarChar(50), enquiryId);

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
        request.input('id', sql.VarChar(50), enquiryId);

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

        if (setClause.length > 0) {
          const updateQuery = `UPDATE enquiries SET ${setClause.join(', ')} WHERE id = @id`;
          await request.query(updateQuery);
          updatedTables.instructions = true;
        }
      });
    }

    // Invalidate all unified enquiries cache entries after successful update
    try {
      const deleted = await deleteCachePattern(`${CACHE_CONFIG.PREFIXES.UNIFIED}:enquiries:*`);
      console.log(`🗑️  Invalidated ${deleted} cached enquiries entries after update`);
    } catch (cacheError) {
      console.warn('⚠️  Failed to invalidate cache after update:', cacheError);
      // Don't fail the request if cache invalidation fails
    }

    res.status(200).json({
      success: true,
      message: 'Enquiry updated successfully',
      enquiryId: ID,
      updatedTables
    });

  } catch (error) {
    console.error('❌ Error updating enquiry:', error);
    res.status(500).json({ error: 'Failed to update enquiry', details: error?.message || 'Unknown error' });
  }
});

// Route: POST /api/enquiries-unified/create
// Create a new enquiry in the instructions database
router.post('/create', async (req, res) => {
  try {
    console.log('📝 Create enquiry request received');

    const instructionsConnectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    
    if (!instructionsConnectionString) {
      console.error('❌ Instructions database connection string not found');
      return res.status(500).json({ error: 'Database configuration missing' });
    }

    const data = req.body;

    // Get current London time
    const londonTime = new Date(new Date().toLocaleString("en-US", {timeZone: "Europe/London"}));

    // Build INSERT query with all fields
    const result = await withRequest(instructionsConnectionString, async (request) => {
      // Required fields
      request.input('datetime', sql.DateTime2, londonTime);
      request.input('stage', sql.VarChar(50), data.stage || 'enquiry');
      request.input('aow', sql.VarChar(100), data.aow);
      request.input('moc', sql.VarChar(100), data.moc);
      request.input('first', sql.VarChar(100), data.first);
      request.input('last', sql.VarChar(100), data.last);
      request.input('email', sql.VarChar(255), data.email || null);
      request.input('source', sql.VarChar(100), data.source);

      // Optional fields
      request.input('claim', sql.VarChar(100), data.claim || null);
      request.input('poc', sql.VarChar(255), data.poc || null);
      request.input('pitch', sql.VarChar(100), data.pitch || null);
      request.input('tow', sql.VarChar(100), data.tow || null);
      request.input('phone', sql.VarChar(50), data.phone || null);
      request.input('value', sql.VarChar(50), data.value || null);
      request.input('notes', sql.Text, data.notes || null);
      request.input('rank', sql.Int, data.rank || 4);
      request.input('rating', sql.VarChar(50), data.rating || null);
      request.input('acid', sql.VarChar(50), data.acid || null);
      request.input('card_id', sql.VarChar(50), data.card_id || null);
      request.input('url', sql.VarChar(500), data.url || null);
      request.input('contact_referrer', sql.VarChar(100), data.contact_referrer || null);
      request.input('company_referrer', sql.VarChar(100), data.company_referrer || null);
      request.input('gclid', sql.VarChar(100), data.gclid || null);
      request.input('rep', sql.VarChar(255), data.rep || null);

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

    console.log(`✅ Enquiry created successfully with ID: ${newId}`);

    // Invalidate cache after successful insert
    try {
      const deleted = await deleteCachePattern(`${CACHE_CONFIG.PREFIXES.UNIFIED}:enquiries:*`);
      console.log(`🗑️  Invalidated ${deleted} cached enquiries entries after create`);
    } catch (cacheError) {
      console.warn('⚠️  Failed to invalidate cache after create:', cacheError);
    }

    res.status(201).json({
      success: true,
      id: newId,
      message: 'Enquiry created successfully'
    });

  } catch (error) {
    console.error('❌ Error creating enquiry:', error);
    res.status(500).json({ 
      error: 'Failed to create enquiry', 
      details: error?.message || 'Unknown error' 
    });
  }
});

module.exports = router;
