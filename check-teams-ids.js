require('dotenv').config();
const { ConnectionPool } = require('mssql');

async function checkTeamsMessageIds() {
  const pool = new ConnectionPool(process.env.INSTRUCTIONS_SQL_CONNECTION_STRING);
  await pool.connect();
  
  const result = await pool.request().query(`
    SELECT EnquiryId, TeamsMessageId 
    FROM [dbo].[TeamsBotActivityTracking] 
    WHERE EnquiryId IN (431,432,433,434,435) 
    ORDER BY EnquiryId
  `);
  
  result.recordset.forEach(r => {
    console.log(`EnquiryId: ${r.EnquiryId}, TeamsMessageId: '${r.TeamsMessageId}', Type: ${typeof r.TeamsMessageId}, IsNull: ${r.TeamsMessageId === null}, IsEmpty: ${r.TeamsMessageId === ''}, Length: ${r.TeamsMessageId ? r.TeamsMessageId.toString().length : 'N/A'}`);
  });
  
  await pool.close();
}

checkTeamsMessageIds().catch(console.error);