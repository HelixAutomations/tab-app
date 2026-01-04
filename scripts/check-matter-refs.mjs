import sql from 'mssql';

const instructionsConfig = {
  server: 'instructions.database.windows.net',
  database: 'instructions',
  user: 'instructionsadmin',
  password: process.env.SQL_PASSWORD_INSTRUCTIONS || 'qG?-hTyfhsWE0,,}uJB,',
  options: { encrypt: true, trustServerCertificate: false }
};

const coreConfig = {
  server: 'helix-database-server.database.windows.net',
  database: 'helix-core-data',
  user: 'helix-database-server',
  password: '3G3rt4Z5VuKHZbS',
  options: { encrypt: true, trustServerCertificate: false }
};

async function check() {
  try {
    console.log('=== INSTRUCTIONS DATABASE ===\n');
    await sql.connect(instructionsConfig);
    
    console.log('=== Una Saplamides (unasap@msn.com) ===\n');
    
    let result = await sql.query`
      SELECT DealId, LeadClientEmail, InstructionRef, Status, PitchedBy
      FROM Deals 
      WHERE LOWER(LeadClientEmail) = 'unasap@msn.com'
    `;
    console.log('Deals:', result.recordset);
    
    result = await sql.query`
      SELECT MatterID, InstructionRef, DisplayNumber, Status
      FROM Matters 
      WHERE InstructionRef = 'HLX-28517-96019'
    `;
    console.log('Matters:', result.recordset);
    
    console.log('\n=== Wayne Coleman (w.f.coleman@btinternet.com) ===\n');
    
    result = await sql.query`
      SELECT DealId, LeadClientEmail, InstructionRef, Status, PitchedBy
      FROM Deals 
      WHERE LOWER(LeadClientEmail) = 'w.f.coleman@btinternet.com'
    `;
    console.log('Deals:', result.recordset);
    
    const dealsResult = result.recordset;
    const instructionRef = dealsResult[0]?.InstructionRef;
    if (instructionRef) {
      result = await sql.query`
        SELECT MatterID, InstructionRef, DisplayNumber, Status
        FROM Matters 
        WHERE InstructionRef = ${instructionRef}
      `;
      console.log('Matters for', instructionRef, ':', result.recordset);
    }
    
    // Check the second InstructionRef too
    const instructedDeal = dealsResult.find(d => d.Status === 'Instructed');
    if (instructedDeal && instructedDeal.InstructionRef !== instructionRef) {
      result = await sql.query`
        SELECT MatterID, InstructionRef, DisplayNumber, Status
        FROM Matters 
        WHERE InstructionRef = ${instructedDeal.InstructionRef}
      `;
      console.log('Matters for', instructedDeal.InstructionRef, ':', result.recordset);
    }
    
    await sql.close();
    
    console.log('\n\n=== HELIX CORE DATABASE ===\n');
    await sql.connect(coreConfig);
    
    // Check if matters table exists
    result = await sql.query`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'matters'
    `;
    
    if (result.recordset.length > 0) {
      console.log('Matters table exists in helix-core-data\n');
      
      // Check Una
      result = await sql.query`
        SELECT * FROM matters 
        WHERE [Display Number] = 'HLX-28517-96019'
      `;
      console.log('Una Saplamides matter:', result.recordset);
      
      // Check Wayne
      result = await sql.query`
        SELECT * FROM matters 
        WHERE [Display Number] = 'COLEM10893-00001'
      `;
      console.log('Wayne Coleman matter:', result.recordset);
    } else {
      console.log('No matters table in helix-core-data');
    }
    
    await sql.close();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

check();
