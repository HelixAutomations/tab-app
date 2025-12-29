import sql from 'mssql';

const helixCoreConfig = {
  server: 'helix-database-server.database.windows.net',
  database: 'helix-core-data',
  user: 'helix-database-server',
  password: '3G3rt4Z5VuKHZbS',
  options: { encrypt: true, trustServerCertificate: false }
};

const instructionsConfig = {
  server: 'instructions.database.windows.net',
  database: 'instructions',
  user: 'instructionsadmin',
  password: 'qG?-hTyfhsWE0,,}uJB,',
  options: { encrypt: true, trustServerCertificate: false }
};

async function findEnquiry() {
  console.log('=== Fixing POC for enquiry ID 800 ===');
  try {
    const pool2 = await sql.connect(instructionsConfig);
    
    // Update POC to team@helix-law.com so it shows as unclaimed
    await pool2.query`UPDATE enquiries SET poc = 'team@helix-law.com' WHERE id = 800`;
    
    // Verify
    const result = await pool2.query`SELECT id, first, last, email, poc, stage FROM enquiries WHERE id = 800`;
    console.log('Updated record:', JSON.stringify(result.recordset, null, 2));
    
    await pool2.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

findEnquiry();
