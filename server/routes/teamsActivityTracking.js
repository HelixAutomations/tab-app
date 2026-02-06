const express = require('express');
const { withRequest } = require('../utils/db');

const router = express.Router();

// Generate Teams deep link by ID or EnquiryId
router.get('/link/:identifier', async (req, res) => {
  const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING || process.env.SQL_CONNECTION_STRING;
  if (!connectionString) {
    return res.status(500).json({ error: 'Instructions SQL connection string not configured' });
  }

  const { identifier } = req.params;
  const { type } = req.query; // 'id' or 'enquiry' - defaults to auto-detect

  try {
    const record = await withRequest(connectionString, async (request) => {
      const sql = require('mssql');
      let query;
      
      // Auto-detect or use specified type
      if (type === 'enquiry' || (!type && !isNaN(parseInt(identifier, 10)) && parseInt(identifier, 10) > 100)) {
        // Likely an enquiry ID (usually higher numbers)
        request.input('enquiryId', sql.Int, parseInt(identifier, 10));
        query = `
          SELECT TOP 1
            Id,
            ActivityId,
            ChannelId,
            TeamId,
            EnquiryId,
            LeadName,
            Email,
            CardType,
            TeamsMessageId,
            DATEDIFF_BIG(MILLISECOND, '1970-01-01', CreatedAt) AS CreatedAtMs,
            Stage,
            Status,
            CreatedAt
          FROM [instructions].[dbo].[TeamsBotActivityTracking]
          WHERE EnquiryId = @enquiryId
            AND Status = 'active'
            AND ChannelId IS NOT NULL 
            AND TeamId IS NOT NULL
          ORDER BY CreatedAt DESC
        `;
      } else {
        // Treat as record ID
        request.input('id', sql.BigInt, parseInt(identifier, 10));
        query = `
          SELECT 
            Id,
            ActivityId,
            ChannelId,
            TeamId,
            EnquiryId,
            LeadName,
            Email,
            CardType,
            TeamsMessageId,
            DATEDIFF_BIG(MILLISECOND, '1970-01-01', CreatedAt) AS CreatedAtMs,
            Stage,
            Status,
            CreatedAt
          FROM [instructions].[dbo].[TeamsBotActivityTracking]
          WHERE Id = @id
            AND Status = 'active'
            AND ChannelId IS NOT NULL 
            AND TeamId IS NOT NULL
        `;
      }
      
      const result = await request.query(query);
      return result.recordset[0];
    }, 2);

    if (!record) {
      return res.status(404).json({ 
        error: `No active record found for ${type || 'identifier'}: ${identifier}` 
      });
    }

    // Generate the Teams deep link
    const teamsLink = generateTeamsDeepLink(
      record.ChannelId,
      record.ActivityId,
      record.TeamId,
      record.TeamsMessageId,
      record.CreatedAtMs
    );

    res.json({
      success: true,
      identifier: identifier,
      identifierType: type || (record.EnquiryId == identifier ? 'enquiry' : 'id'),
      record: {
        id: record.Id,
        enquiryId: record.EnquiryId,
        leadName: record.LeadName,
        email: record.Email,
        cardType: record.CardType,
        stage: record.Stage,
        createdAt: record.CreatedAt
      },
      teamsLink: teamsLink,
      linkComponents: {
        channelId: record.ChannelId,
        teamId: record.TeamId,
        activityId: record.ActivityId,
        teamsMessageId: record.TeamsMessageId
      }
    });

  } catch (error) {
    console.error('❌ Error generating Teams link:', error);
    res.status(500).json({ 
      error: 'Failed to generate Teams link',
      detail: error.message 
    });
  }
});

// Get Teams activity tracking data for enquiries
router.get('/', async (req, res) => {
  const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING || process.env.SQL_CONNECTION_STRING;
  if (!connectionString) {
    return res.status(500).json({ error: 'Instructions SQL connection string not configured' });
  }

  try {
    const { enquiryIds } = req.query;
    
    if (!enquiryIds) {
      return res.status(400).json({ error: 'enquiryIds parameter required' });
    }

    // Parse enquiry IDs (comma-separated)
    const ids = enquiryIds.split(',').map(id => id.trim()).filter(Boolean);
    
    if (ids.length === 0) {
      return res.json([]);
    }
    
    // TeamsBotActivityTracking.EnquiryId refers to instructions.enquiries.id (new enquiry IDs)
    // Legacy IDs (from helix-core-data) are stored in instructions.enquiries.acid
    // So we need to map legacy IDs → new enquiry IDs via acid column
    const rows = await withRequest(connectionString, async (request) => {
      const sql = require('mssql');
      const numericIds = ids.filter(id => !isNaN(parseInt(id, 10)));
      
      if (numericIds.length === 0) {
        return []; // No valid IDs to query
      }
      
      // First, map legacy IDs to new enquiry IDs via acid column
      numericIds.forEach((id, index) => {
        request.input(`acid${index}`, sql.VarChar(50), id);
      });
      const acidPlaceholders = numericIds.map((_, index) => `@acid${index}`).join(', ');
      
      const acidMappingResult = await request.query(`
        SELECT id, acid FROM [instructions].[dbo].[enquiries] 
        WHERE acid IN (${acidPlaceholders})
      `);
      
      // Build a map: legacyId → newEnquiryId
      const acidToNewId = {};
      acidMappingResult.recordset.forEach(row => {
        if (row.acid && row.id) {
          acidToNewId[row.acid] = row.id;
        }
      });
      
      // Collect all IDs to query (both new IDs from mapping AND original IDs in case they match directly)
      const allIdsToQuery = new Set();
      numericIds.forEach(id => {
        allIdsToQuery.add(parseInt(id, 10)); // Original ID (might be new enquiry ID)
        if (acidToNewId[id]) {
          allIdsToQuery.add(acidToNewId[id]); // Mapped new enquiry ID
        }
      });
      
      const allIdsArray = Array.from(allIdsToQuery);
      
      if (allIdsArray.length === 0) {
        return [];
      }
      
      allIdsArray.forEach((id, index) => {
        request.input(`id${index}`, sql.Int, id);
      });

      const numericPlaceholders = allIdsArray.map((_, index) => `@id${index}`).join(', ');
      
      const result = await request.query(`
        SELECT 
          Id,
          ActivityId,
          ChannelId,
          TeamId,
          EnquiryId,
          LeadName,
          Email,
          Phone,
          CardType,
          MessageTimestamp,
          TeamsMessageId,
          DATEDIFF_BIG(MILLISECOND, '1970-01-01', CreatedAt) AS CreatedAtMs,
          Stage,
          Status,
          ClaimedBy,
          ClaimedAt,
          CreatedAt,
          UpdatedAt
        FROM [instructions].[dbo].[TeamsBotActivityTracking]
        WHERE EnquiryId IN (${numericPlaceholders})
          AND Status = 'active'
          AND TeamsMessageId IS NOT NULL
          AND LEN(ISNULL(TeamsMessageId, '')) > 0
          AND ISNUMERIC(TeamsMessageId) = 1
        ORDER BY CreatedAt DESC
      `);
      
      // Build reverse map: newEnquiryId → legacyId (for result annotation)
      const newIdToAcid = {};
      Object.entries(acidToNewId).forEach(([acid, newId]) => {
        newIdToAcid[newId] = acid;
      });
      
      // Annotate results with legacy ID where applicable
      const annotatedResults = (result.recordset || []).map(row => ({
        ...row,
        LegacyEnquiryId: newIdToAcid[row.EnquiryId] || null
      }));
      
      return annotatedResults;
    }, 2);

    // Transform the data to include Teams deep link
    const transformedData = rows.map(row => {
      const link = generateTeamsDeepLink(
        row.ChannelId, 
        row.ActivityId, 
        row.TeamId, 
        row.TeamsMessageId,
        row.CreatedAtMs,
        row.MessageTimestamp
      );
      return {
        ...row,
        teamsLink: link
      };
    });

    res.json(transformedData);
  } catch (error) {
    console.error('❌ Error fetching teams activity tracking:', error);
    res.status(500).json({ 
      error: 'Failed to fetch teams activity tracking data',
      detail: error.message 
    });
  }
});

/**
 * Generate Teams deep link using the message's creation timestamp (epoch ms).
 * MS Docs: https://learn.microsoft.com/en-us/microsoftteams/platform/concepts/build-and-test/deep-link-teams
 */
function generateTeamsDeepLink(channelId, activityId, teamId, teamsMessageId, createdAtMs, messageTimestamp) {
  const tenantId = "7fbc252f-3ce5-460f-9740-4e1cb8bf78b8";

  if (!channelId || !teamId) {
    console.warn("[teams-activity] Missing required fields for deep link:", { channelId, teamId });
    return null;
  }

  const resolveMessageId = (value) => {
    if (!value) return null;
    if (typeof value === 'number' && value > 1640995200000) return value;
    const raw = String(value).trim();
    if (!raw) return null;
    if (raw.startsWith('0:')) {
      const tail = raw.split(':')[1];
      if (tail && /^\d{13,}$/.test(tail)) return Number(tail);
    }
    const match = raw.match(/\d{13,}/);
    if (match) return Number(match[0]);
    return null;
  };

  // Teams deep links use epoch millisecond timestamps as messageId
  let messageId = resolveMessageId(teamsMessageId)
    || resolveMessageId(activityId)
    || null;

  if (!messageId && messageTimestamp) {
    const ts = Date.parse(messageTimestamp);
    if (!Number.isNaN(ts)) messageId = ts;
  }

  if (!messageId) {
    messageId = resolveMessageId(createdAtMs)
      || resolveMessageId(messageTimestamp);
  }
  
  if (!messageId) {
    console.warn("[teams-activity] No valid timestamp available for deep link");
    return null;
  }

  const encGroup = encodeURIComponent(teamId);
  const messageIdToken = String(messageId);
  
  // Determine channel name from channelId for better UX
  let channelName = "General";
  if (channelId.includes('09c0d3669cd2464aab7db60520dd9180')) {
    channelName = "Commercial New Enquiries";
  } else if (channelId.includes('2ba7d5a50540426da60196c3b2daf8e8')) {
    channelName = "Construction New Enquiries";
  } else if (channelId.includes('6d09477d15d548a6b56f88c59b674da6')) {
    channelName = "Property New Enquiries";
  }

  const link = `https://teams.microsoft.com/l/message/${channelId}/${messageIdToken}?tenantId=${tenantId}&groupId=${encGroup}&parentMessageId=${messageIdToken}&teamName=${encodeURIComponent('Helix Law')}&channelName=${encodeURIComponent(channelName)}&createdTime=${messageId}`;
  
  return link;
}

module.exports = router;
