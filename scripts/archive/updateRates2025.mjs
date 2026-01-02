// scripts/updateRates2025.mjs
// Run: node scripts/updateRates2025.mjs

import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load from env/.env.dev
dotenv.config({ path: path.join(__dirname, '../env/.env.dev') });
dotenv.config({ path: path.join(__dirname, '../env/.env.dev.user'), override: true });

// Connection strings from env
const helixCoreConn = process.env.SQL_CONNECTION_STRING;

// Instructions DB uses same server, different catalog
const instructionsConn = helixCoreConn 
  ? helixCoreConn.replace('helix-core-data', 'instructions')
  : null;

async function runUpdate(dbName, connectionString) {
  if (!connectionString) {
    console.error(`No connection string for ${dbName}`);
    return;
  }

  try {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Connecting to ${dbName}...`);
    const pool = await sql.connect(connectionString);
    console.log('Connected!');
    
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
    console.log(`\nUpdated rates in ${dbName}:`);
    console.table(verify.recordset);
    
    await pool.close();
    console.log(`✓ ${dbName} complete\n`);
    
  } catch (err) {
    console.error(`Error on ${dbName}:`, err.message);
    throw err;
  }
}

async function main() {
  console.log('2025 Rate Update Script');
  console.log('=======================');
  console.log('New rates: Senior Partner £475, Partner £425, Assoc Solicitor £350, Solicitor £310, Paralegal £210\n');
  
  const connections = {
    'helix-core-data': helixCoreConn,
    'instructions': instructionsConn
  };
  
  for (const [dbName, connStr] of Object.entries(connections)) {
    await runUpdate(dbName, connStr);
  }
  
  console.log('\n✅ All databases updated successfully!');
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
