import { config } from 'dotenv';
import sql from 'mssql';

config();

async function lookup() {
  const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
  
  console.log('=== enquiries TABLE (exact email) ===');
  const r1 = await pool.request().query(`
    SELECT * FROM enquiries WHERE Email = 'rob.bedwell@me.com'
  `);
  console.log(r1.recordset.length ? JSON.stringify(r1.recordset, null, 2) : 'No results');

  console.log('\n=== enquiries TABLE (Robert + Bedwell) ===');
  const r2 = await pool.request().query(`
    SELECT * FROM enquiries 
    WHERE First_Name LIKE '%Robert%' AND Last_Name LIKE '%Bedwell%'
  `);
  console.log(r2.recordset.length ? JSON.stringify(r2.recordset, null, 2) : 'No results');

  console.log('\n=== enquiries_backup TABLE (exact email) ===');
  const r3 = await pool.request().query(`
    SELECT * FROM enquiries_backup WHERE Email = 'rob.bedwell@me.com'
  `);
  console.log(r3.recordset.length ? JSON.stringify(r3.recordset, null, 2) : 'No results');

  console.log('\n=== enquiries_backup TABLE (Robert + Bedwell) ===');
  const r4 = await pool.request().query(`
    SELECT * FROM enquiries_backup 
    WHERE First_Name LIKE '%Robert%' AND Last_Name LIKE '%Bedwell%'
  `);
  console.log(r4.recordset.length ? JSON.stringify(r4.recordset, null, 2) : 'No results');
  
  await pool.close();
}

lookup().catch(console.error);
