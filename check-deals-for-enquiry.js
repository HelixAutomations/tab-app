const sql = require('mssql');

const config = {
  server: 'instructions.database.windows.net',
  database: 'instructions',
  user: 'instructionsadmin',
  password: 'qG?-hTyfhsWE0,,}uJB,',
  options: {
    encrypt: true,
    trustServerCertificate: false,
  },
};

async function checkDeals() {
  try {
    await sql.connect(config);
    console.log('Connected to database\n');

    const email = 'symbolkay2002@yahoo.com';

    // Check Deals table for this email
    const dealsResult = await sql.query`
      SELECT 
        d.DealId,
        d.LeadClientEmail,
        d.ServiceDescription,
        d.Status,
        d.AreaOfWork,
        d.PitchedBy,
        d.PitchedDate,
        d.PitchedTime,
        p.ScenarioId
      FROM [instructions].[dbo].[Deals] d
      LEFT JOIN [instructions].[dbo].[PitchContent] p ON d.DealId = p.DealId
      WHERE LOWER(d.LeadClientEmail) = ${email.toLowerCase()}
      ORDER BY d.PitchedDate DESC, d.PitchedTime DESC
    `;

    console.log('=== DEALS FOR EMAIL: ' + email + ' ===');
    if (dealsResult.recordset.length === 0) {
      console.log('No deals found');
    } else {
      console.log(JSON.stringify(dealsResult.recordset, null, 2));
    }

    await sql.close();
  } catch (err) {
    console.error('Database error:', err);
  }
}

checkDeals();
