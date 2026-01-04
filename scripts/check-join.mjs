import sql from 'mssql';

const instructionsPool = new sql.ConnectionPool({
  server: 'instructions.database.windows.net',
  database: 'instructions',
  user: 'instructionsadmin',
  password: 'qG?-hTyfhsWE0,,}uJB,',
  options: { encrypt: true }
});

const legacyPool = new sql.ConnectionPool({
  server: 'helix-database-server.database.windows.net',
  database: 'helix-core-data',
  user: 'helix-database-server',
  password: '3G3rt4Z5VuKHZbS',
  options: { encrypt: true }
});

async function check() {
  try {
    await legacyPool.connect();
    
    console.log('=== Wayne Coleman matter in Legacy DB ===\n');
    const wayne = await legacyPool.request().query(`
      SELECT [Unique ID], [Display Number] 
      FROM matters 
      WHERE [Display Number] = 'COLEM10893-00001'
    `);
    console.log(wayne.recordset);
    
    console.log('\n=== Check if Deals.InstructionRef exists in legacy matters ===\n');
    // InstructionRef from Deals for Wayne: HLX-28497-37333
    const byInstructionRef = await legacyPool.request().query(`
      SELECT [Unique ID], [Display Number] 
      FROM matters 
      WHERE [Display Number] = 'HLX-28497-37333'
    `);
    console.log('Match by InstructionRef:', byInstructionRef.recordset);
    
    await legacyPool.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

check();
