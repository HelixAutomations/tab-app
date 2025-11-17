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

    // Create parameterized query to prevent SQL injection
    const placeholders = ids.map((_, index) => `@id${index}`).join(', ');
    
    const rows = await withRequest(connectionString, async (request) => {
      // Add parameters for each enquiry ID
      // EnquiryId column is INT, so filter out non-numeric values first
      const sql = require('mssql');
      const numericIds = ids.filter(id => !isNaN(parseInt(id, 10)));
      
      if (numericIds.length === 0) {
        return []; // No valid IDs to query
      }
      
      numericIds.forEach((id, index) => {
        request.input(`id${index}`, sql.Int, parseInt(id, 10));
      });

      const numericPlaceholders = numericIds.map((_, index) => `@id${index}`).join(', ');
      
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
      
      return Array.isArray(result.recordset) ? result.recordset : [];
    }, 2);

    // Transform the data to include Teams deep link
    const transformedData = rows.map(row => {
      const link = generateTeamsDeepLink(
        row.ChannelId, 
        row.ActivityId, 
        row.TeamId, 
        row.TeamsMessageId, // Use the precise TeamsMessageId
        row.CreatedAtMs
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
 * Teams deep links use the epoch milliseconds as the messageId, NOT the Bot Framework ActivityId.
 */
function generateTeamsDeepLink(channelId, activityId, teamId, teamsMessageId, createdAtMs) {
  const tenantId = "7fbc252f-3ce5-460f-9740-4e1cb8bf78b8";

  if (!channelId || !teamId) {
    console.warn("[teams-activity] Missing required fields for deep link:", { channelId, teamId });
    return null;
  }

  // Use the precise TeamsMessageId that preserves exact millisecond timestamp
  let messageId;
  
  if (teamsMessageId && teamsMessageId > 1640995200000) { // After Jan 1, 2022
    // Use the exact TeamsMessageId - no adjustment needed as it's already precise
    messageId = teamsMessageId;
  } else if (createdAtMs) {
    // Fallback: CreatedAt is usually ~500ms after the actual Teams message
    messageId = createdAtMs - 500;
  } else {
    // Last resort: use activityId (least reliable for deep links)
    messageId = activityId;
  }
  
  if (!messageId) {
    console.warn("[teams-activity] No valid timestamp available for deep link");
    return null;
  }

  const encChannel = encodeURIComponent(channelId);
  const encGroup = encodeURIComponent(teamId);
  const messageIdToken = encodeURIComponent(String(messageId));
  
  // Determine channel name from channelId for better UX
  let channelName = "General";
  if (channelId.includes('09c0d3669cd2464aab7db60520dd9180')) {
    channelName = "Commercial New Enquiries";
  } else if (channelId.includes('2ba7d5a50540426da60196c3b2daf8e8')) {
    channelName = "Construction New Enquiries";
  } else if (channelId.includes('6d09477d15d548a6b56f88c59b674da6')) {
    channelName = "Property New Enquiries";
  }

  const link = `https://teams.microsoft.com/l/message/${encChannel}/${messageIdToken}?tenantId=${tenantId}&groupId=${encGroup}&parentMessageId=${messageIdToken}&teamName=${encodeURIComponent('Helix Law')}&channelName=${encodeURIComponent(channelName)}&createdTime=${messageId}`;
  
  return link;
}

module.exports = router;
