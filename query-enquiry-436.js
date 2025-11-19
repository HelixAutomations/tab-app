const sql = require('mssql');

const config = {
  user: 'instructionsadmin',
  password: 'qG?-hTyfhsWE0,,}uJB,',
  server: 'instructions.database.windows.net',
  database: 'instructions',
  options: { 
    encrypt: true,
    trustServerCertificate: false
  }
};

async function queryEnquiry() {
  try {
    await sql.connect(config);
    console.log('Connected to database\n');

    // Query enquiry 436
    const enquiryResult = await sql.query`
      SELECT *
      FROM enquiries
      WHERE ID = 436
    `;
    console.log('=== ENQUIRY 436 ===');
    console.log(JSON.stringify(enquiryResult.recordset[0], null, 2));

    // Query Teams activity
    const email = enquiryResult.recordset[0]?.Email;
    if (email) {
      const teamsResult = await sql.query`
        SELECT 
          EnquiryId,
          Email,
          ClaimedBy,
          ClaimedAt,
          CreatedAt,
          Stage,
          Status
        FROM TeamsBotActivityTracking
        WHERE EnquiryId = 436
        ORDER BY CreatedAt DESC
      `;
      console.log('\n=== TEAMS ACTIVITY ===');
      console.log(JSON.stringify(teamsResult.recordset, null, 2));

      // Query Deals
      const dealsResult = await sql.query`
        SELECT 
          DealId,
          EnquiryId,
          LeadClientEmail,
          Status,
          PitchedDate,
          PitchedTime,
          CreatedDate
        FROM Deals
        WHERE EnquiryId = 436 OR LOWER(LeadClientEmail) = ${email.toLowerCase()}
      `;
      console.log('\n=== DEALS ===');
      console.log(JSON.stringify(dealsResult.recordset, null, 2));

      // Query PitchContent
      if (dealsResult.recordset.length > 0) {
        const dealId = dealsResult.recordset[0].DealId;
        const pitchResult = await sql.query`
          SELECT *
          FROM PitchContent
          WHERE DealId = ${dealId}
        `;
        console.log('\n=== PITCH CONTENT ===');
        console.log(JSON.stringify(pitchResult.recordset, null, 2));
      }
    }

    await sql.close();
  } catch (err) {
    console.error('Error:', err);
  }
}

queryEnquiry();
