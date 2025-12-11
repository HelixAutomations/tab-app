const sql = require('mssql');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

async function query() {
  // Get password from Key Vault - instructions database uses different secret
  const credential = new DefaultAzureCredential();
  const kvClient = new SecretClient('https://helix-keys.vault.azure.net/', credential);
  const secret = await kvClient.getSecret('instructions-sql-password');
  
  const config = {
    user: 'instructions',
    password: secret.value,
    server: 'instructions.database.windows.net',
    database: 'instructions',
    options: { encrypt: true, trustServerCertificate: false }
  };
  
  await sql.connect(config);
  
  // First list tables
  console.log('=== TABLES ===');
  const tables = await sql.query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES ORDER BY TABLE_NAME`);
  console.log(tables.recordset.map(t => t.TABLE_NAME));
  
  const refs = "'HLX-DEV-LUKE','HLX-28381-51696','HLX-27367-72547','HLX-22388-86286','HLX-22388-78698','HLX-22338-67901','HLX-22338-44379','HLX-00208-19832'";
  
  console.log('=== ENQUIRIES DATA ===');
  const instResult = await sql.query(`
    SELECT [Instruction ID], Stage, [Point of Contact], [Date Created], [Matter ID]
    FROM dbo.enquiries 
    WHERE [Instruction ID] IN (${refs})
  `);
  console.log(JSON.stringify(instResult.recordset, null, 2));
  
  console.log('\n=== POID DATA ===');
  const poidResult = await sql.query(`
    SELECT * FROM dbo.poid 
    WHERE [Instruction ID] IN (${refs})
  `);
  console.log(JSON.stringify(poidResult.recordset, null, 2));
  
  await sql.close();
}

query().catch(e => console.error(e));
