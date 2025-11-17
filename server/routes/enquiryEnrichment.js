const express = require('express');
const { withRequest } = require('../utils/db');

const router = express.Router();

// Unified enrichment endpoint - combines Teams and pitch data for enquiries
router.get('/', async (req, res) => {
  console.log('🚀 Enrichment API called with query:', req.query);
  
  const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING || process.env.SQL_CONNECTION_STRING;
  if (!connectionString) {
    console.error('❌ No SQL connection string configured');
    return res.status(500).json({ error: 'Instructions SQL connection string not configured' });
  }

  try {
    const { enquiryIds, enquiryEmails } = req.query;
    
    if (!enquiryIds && !enquiryEmails) {
      console.log('⚠️ No parameters provided');
      return res.status(400).json({ error: 'Either enquiryIds or enquiryEmails parameter required' });
    }

    // Parse parameters
    const ids = enquiryIds ? enquiryIds.split(',').map(id => id.trim()).filter(Boolean) : [];
    const emails = enquiryEmails ? enquiryEmails.split(',').map(email => email.trim().toLowerCase()).filter(Boolean) : [];

    console.log(`🔍 Processing enrichment: ${ids.length} IDs, ${emails.length} emails`);

    const enrichmentData = await withRequest(connectionString, async (request) => {
      const sql = require('mssql');
      const results = {};

      // Fetch Teams activity data for v2 enquiries (by ID)
      if (ids.length > 0) {
        const numericIds = ids.filter(id => !isNaN(parseInt(id, 10)));
        
        if (numericIds.length > 0) {
          numericIds.forEach((id, index) => {
            request.input(`teamId${index}`, sql.Int, parseInt(id, 10));
          });

          const teamsPlaceholders = numericIds.map((_, index) => `@teamId${index}`).join(', ');
          
          const teamsResult = await request.query(`
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
            WHERE EnquiryId IN (${teamsPlaceholders})
              AND Status = 'active'
              AND TeamsMessageId IS NOT NULL
              AND LEN(ISNULL(TeamsMessageId, '')) > 0
              AND ISNUMERIC(TeamsMessageId) = 1
            ORDER BY CreatedAt DESC
          `);

          // Process Teams data
          teamsResult.recordset.forEach(row => {
            const enquiryId = row.EnquiryId?.toString();
            if (enquiryId) {
              if (!results[enquiryId]) results[enquiryId] = {};
              results[enquiryId].teamsData = {
                ...row,
                Phone: row.Phone || '', // Ensure Phone is never null/undefined
                ClaimedBy: row.ClaimedBy || '', // Ensure ClaimedBy is never null/undefined
                ClaimedAt: row.ClaimedAt || '', // Ensure ClaimedAt is never null/undefined
                teamsLink: generateTeamsDeepLink(
                  row.ChannelId, 
                  row.ActivityId, 
                  row.TeamId, 
                  row.TeamsMessageId,
                  row.CreatedAtMs
                )
              };
            }
          });
        }
      }

      // Fetch pitch data for all enquiries (by email)
      if (emails.length > 0) {
        // Clear previous inputs for pitch query
        request.inputs = {};
        
        emails.forEach((email, index) => {
          request.input(`pitchEmail${index}`, sql.NVarChar, email);
        });

        const emailPlaceholders = emails.map((_, index) => `@pitchEmail${index}`).join(', ');

        const pitchResult = await request.query(`
          SELECT 
            DealId,
            LeadClientEmail,
            ServiceDescription,
            Amount,
            Status,
            AreaOfWork,
            PitchedBy,
            PitchedDate,
            PitchedTime,
            CloseDate,
            CloseTime,
            PitchContent
          FROM [instructions].[dbo].[Deals]
          WHERE LOWER(LeadClientEmail) IN (${emailPlaceholders})
            AND Status IS NOT NULL
          ORDER BY PitchedDate DESC, PitchedTime DESC
        `);

        // Process pitch data and create email → pitch mapping
        const pitchByEmail = new Map();
        pitchResult.recordset.forEach(row => {
          const email = row.LeadClientEmail?.toLowerCase();
          if (email) {
            pitchByEmail.set(email, {
              dealId: row.DealId,
              email: email,
              serviceDescription: row.ServiceDescription,
              amount: row.Amount,
              status: row.Status,
              areaOfWork: row.AreaOfWork,
              pitchedBy: row.PitchedBy,
              pitchedDate: row.PitchedDate,
              pitchedTime: row.PitchedTime,
              closeDate: row.CloseDate,
              closeTime: row.CloseTime,
              pitchContent: row.PitchContent,
              scenarioDisplay: getScenarioDisplayName(row.AreaOfWork, row.ServiceDescription)
            });
          }
        });

        // Add pitch data to results (need enquiry email mapping from frontend)
        return { results, pitchByEmail: Object.fromEntries(pitchByEmail) };
      }

      return { results, pitchByEmail: {} };
    }, 2);

    // Transform to array format for easier consumption
    const enrichmentArray = Object.entries(enrichmentData.results).map(([enquiryId, data]) => ({
      enquiryId,
      ...data
    }));

    console.log(`🔗 Enrichment: ${enrichmentArray.length} enquiries with Teams data, ${Object.keys(enrichmentData.pitchByEmail).length} emails with pitch data`);

    res.json({
      enquiryData: enrichmentArray,
      pitchByEmail: enrichmentData.pitchByEmail
    });
    
  } catch (error) {
    console.error('❌ Error fetching enrichment data:', error);
    res.status(500).json({ 
      error: 'Failed to fetch enrichment data',
      detail: error.message 
    });
  }
});

/**
 * Generate Teams deep link using the message's creation timestamp (epoch ms).
 */
function generateTeamsDeepLink(channelId, activityId, teamId, teamsMessageId, createdAtMs) {
  const tenantId = "7fbc252f-3ce5-460f-9740-4e1cb8bf78b8";

  if (!channelId || !teamId) {
    console.warn("[enrichment] Missing required fields for deep link:", { channelId, teamId });
    return null;
  }

  // Use the precise TeamsMessageId that preserves exact millisecond timestamp
  let messageId;
  
  if (teamsMessageId && teamsMessageId > 1640995200000) { // After Jan 1, 2022
    messageId = teamsMessageId;
  } else if (createdAtMs) {
    messageId = createdAtMs - 500;
  } else {
    messageId = activityId;
  }
  
  if (!messageId) {
    console.warn("[enrichment] No valid timestamp available for deep link");
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

/**
 * Map area of work and service description to display names
 */
function getScenarioDisplayName(areaOfWork, serviceDescription) {
  const areaMapping = {
    'commercial': 'Commercial',
    'employment': 'Employment', 
    'property': 'Property',
    'construction': 'Construction',
    'family': 'Family',
    'crime': 'Crime'
  };
  
  const area = areaOfWork?.toLowerCase();
  if (area && areaMapping[area]) {
    return areaMapping[area];
  }
  
  return areaOfWork || 'Pitch';
}

module.exports = router;