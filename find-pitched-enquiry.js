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

async function findPitchedEnquiry() {
  try {
    await sql.connect(config);
    console.log('Connected to database\n');

    // Find enquiries with both claim and pitch data (pitch is integer ID)
    const result = await sql.query`
      SELECT TOP 5 
        e.id,
        e.datetime,
        e.claim,
        e.pitch,
        e.email,
        e.poc,
        e.stage
      FROM enquiries e
      WHERE e.claim IS NOT NULL 
        AND e.pitch IS NOT NULL
      ORDER BY e.id DESC
    `;

    console.log('=== ENQUIRIES WITH BOTH CLAIM AND PITCH ===');
    console.log(JSON.stringify(result.recordset, null, 2));

    await sql.close();
  } catch (err) {
    console.error('Database error:', err);
  }
}

findPitchedEnquiry();
