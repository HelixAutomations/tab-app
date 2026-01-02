// scripts/updateRatesInstructions.mjs
// Run: node scripts/updateRatesInstructions.mjs
// Update the team table in instructions database

import sql from 'mssql';
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';

async function main() {
  console.log('Instructions DB Rate Update Script');
  console.log('===================================\n');
  
  // Get password from Key Vault (helixlaw-instructions vault)
  console.log('Fetching credentials from Key Vault...');
  const credential = new DefaultAzureCredential();
  const kvClient = new SecretClient('https://helixlaw-instructions.vault.azure.net/', credential);
  const passwordSecret = await kvClient.getSecret('instructionsadmin-password');
  
  const config = {
    server: 'instructions.database.windows.net',
    database: 'instructions',
    user: 'instructionsadmin',
    password: passwordSecret.value,
    options: {
      encrypt: true,
      trustServerCertificate: false
    }
  };

  try {
    console.log('Connecting to instructions database...');
    const pool = await sql.connect(config);
    console.log('Connected!\n');
    
    // 1. Promote Alex & Jonathan to Senior Partner (£475)
    let result = await pool.request().query(`
      UPDATE [dbo].[team] 
      SET [Role] = 'Senior Partner', [Rate] = 475 
      WHERE [First] = 'Alex' AND [Last] = 'Cook'
    `);
    console.log(`✓ Alex Cook → Senior Partner £475 (${result.rowsAffected[0]} row)`);
    
    result = await pool.request().query(`
      UPDATE [dbo].[team] 
      SET [Role] = 'Senior Partner', [Rate] = 475 
      WHERE [First] = 'Jonathan' AND [Last] = 'Waters'
    `);
    console.log(`✓ Jonathan Waters → Senior Partner £475 (${result.rowsAffected[0]} row)`);
    
    // 2. Update remaining Partners (£425)
    result = await pool.request().query(`
      UPDATE [dbo].[team] 
      SET [Rate] = 425 
      WHERE [Role] = 'Partner'
    `);
    console.log(`✓ Partners → £425 (${result.rowsAffected[0]} rows)`);
    
    // 3. Associate Solicitors (£350)
    result = await pool.request().query(`
      UPDATE [dbo].[team] 
      SET [Rate] = 350 
      WHERE [Role] = 'Associate Solicitor'
    `);
    console.log(`✓ Associate Solicitors → £350 (${result.rowsAffected[0]} rows)`);
    
    // 4. Solicitors (£310)
    result = await pool.request().query(`
      UPDATE [dbo].[team] 
      SET [Rate] = 310 
      WHERE [Role] = 'Solicitor'
    `);
    console.log(`✓ Solicitors → £310 (${result.rowsAffected[0]} rows)`);
    
    // 5. Paralegals/Trainees (£210)
    result = await pool.request().query(`
      UPDATE [dbo].[team] 
      SET [Rate] = 210 
      WHERE [Role] IN ('Paralegal', 'paralegal', 'Trainee')
    `);
    console.log(`✓ Paralegals → £210 (${result.rowsAffected[0]} rows)`);
    
    // Verify
    const verify = await pool.request().query(`
      SELECT [Full Name] AS Name, [Role], [Rate] 
      FROM [dbo].[team] 
      WHERE [Rate] > 0 
      ORDER BY [Rate] DESC, [Full Name]
    `);
    console.log(`\nUpdated rates:`);
    console.table(verify.recordset);
    
    await pool.close();
    console.log('\n✅ Instructions database updated successfully!');
    
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
