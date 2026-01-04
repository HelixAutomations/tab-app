const express = require('express');
const { withRequest } = require('../utils/db');
const { loggers } = require('../utils/logger');

const router = express.Router();
const log = loggers.enquiries.child('Enrichment');

// Unified enrichment endpoint - combines Teams and pitch data for enquiries
router.get('/', async (req, res) => {
  const instructionsConnStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  const legacyConnStr = process.env.SQL_CONNECTION_STRING;
  
  if (!instructionsConnStr) {
    return res.status(500).json({ error: 'Instructions SQL connection string not configured' });
  }

  try {
    const { enquiryIds, enquiryEmails } = req.query;
    
    if (!enquiryIds && !enquiryEmails) {
      return res.status(400).json({ error: 'Either enquiryIds or enquiryEmails parameter required' });
    }

    // Parse parameters
    const ids = enquiryIds ? enquiryIds.split(',').map(id => id.trim()).filter(Boolean) : [];
    const emails = enquiryEmails ? enquiryEmails.split(',').map(email => email.trim().toLowerCase()).filter(Boolean) : [];

    const enrichmentData = await withRequest(instructionsConnStr, async (request) => {
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
                Phone: row.Phone || '',
                ClaimedBy: row.ClaimedBy || '',
                ClaimedAt: row.ClaimedAt || '',
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

        // Query pitch data from instructions database (no cross-server JOIN)
        const pitchResult = await request.query(`
          SELECT 
            d.DealId,
            d.LeadClientEmail,
            d.ServiceDescription,
            d.Amount,
            d.Status,
            d.AreaOfWork,
            d.PitchedBy,
            d.PitchedDate,
            d.PitchedTime,
            d.CloseDate,
            d.CloseTime,
            d.InstructionRef,
            p.ScenarioId,
            d.PitchContent,
            inst_m.MatterID
          FROM [instructions].[dbo].[Deals] d
          LEFT JOIN [instructions].[dbo].[PitchContent] p ON d.DealId = p.DealId
          LEFT JOIN [instructions].[dbo].[Matters] inst_m ON d.InstructionRef = inst_m.InstructionRef
          WHERE LOWER(d.LeadClientEmail) IN (${emailPlaceholders})
            AND d.Status IS NOT NULL
          ORDER BY d.PitchedDate DESC, d.PitchedTime DESC
        `);

        // Collect MatterIDs to look up DisplayNumbers from legacy database
        const matterIds = [...new Set(
          pitchResult.recordset
            .map(r => r.MatterID)
            .filter(Boolean)
        )];

        // Fetch DisplayNumbers from legacy database if we have MatterIDs
        let displayNumberMap = new Map();
        if (matterIds.length > 0 && legacyConnStr) {
          try {
            displayNumberMap = await withRequest(legacyConnStr, async (legacyRequest) => {
              matterIds.forEach((id, index) => {
                legacyRequest.input(`matterId${index}`, sql.NVarChar, id);
              });
              const matterPlaceholders = matterIds.map((_, index) => `@matterId${index}`).join(', ');
              
              const legacyResult = await legacyRequest.query(`
                SELECT [Unique ID], [Display Number]
                FROM [dbo].[matters]
                WHERE [Unique ID] IN (${matterPlaceholders})
              `);
              
              const map = new Map();
              legacyResult.recordset.forEach(row => {
                map.set(row['Unique ID'], row['Display Number']);
              });
              return map;
            }, 2);
          } catch (legacyErr) {
            log.warn('Failed to fetch legacy DisplayNumbers', { error: legacyErr.message });
          }
        }

        // Process pitch data and create email → pitch mapping
        const pitchByEmail = new Map();
        pitchResult.recordset.forEach(row => {
          const email = row.LeadClientEmail?.toLowerCase();
          if (email) {
            // Combine PitchedDate and PitchedTime into single datetime
            let combinedPitchedDate = null;
            if (row.PitchedDate && row.PitchedTime) {
              const date = new Date(row.PitchedDate);
              const time = new Date(row.PitchedTime);
              date.setHours(time.getHours(), time.getMinutes(), time.getSeconds(), time.getMilliseconds());
              combinedPitchedDate = date.toISOString();
            } else if (row.PitchedDate) {
              combinedPitchedDate = row.PitchedDate;
            }
            
            const pitchEntry = {
              dealId: row.DealId,
              email: email,
              serviceDescription: row.ServiceDescription,
              amount: row.Amount,
              status: row.Status,
              areaOfWork: row.AreaOfWork,
              pitchedBy: row.PitchedBy,
              pitchedDate: combinedPitchedDate,
              pitchedTime: row.PitchedTime,
              closeDate: row.CloseDate,
              closeTime: row.CloseTime,
              instructionRef: row.InstructionRef,
              displayNumber: row.MatterID ? displayNumberMap.get(row.MatterID) || null : null,
              pitchContent: row.PitchContent,
              scenarioId: row.ScenarioId || (() => {
                // Try to extract scenarioId from PitchContent JSON if not in separate column
                if (row.PitchContent) {
                  try {
                    const parsed = JSON.parse(row.PitchContent);
                    return parsed.scenario || parsed.scenarioId || parsed.id || null;
                  } catch (e) {
                    return null;
                  }
                }
                return null;
              })(),
              scenarioDisplay: getScenarioDisplayName(row.AreaOfWork, row.ServiceDescription)
            };
            pitchByEmail.set(email, pitchEntry);
          }
        });

        return { results, pitchByEmail: Object.fromEntries(pitchByEmail) };
      }

      return { results, pitchByEmail: {} };
    }, 2);

    // Transform to array format
    const enrichmentArray = Object.entries(enrichmentData.results).map(([enquiryId, data]) => ({
      enquiryId,
      ...data
    }));

    res.json({
      enquiryData: enrichmentArray,
      pitchByEmail: enrichmentData.pitchByEmail
    });
    
  } catch (error) {
    log.fail('enquiry:enrich', error, { idCount: req.query.enquiryIds?.split(',').length });
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