// Fix Go Pest matter
require('dotenv').config({ path: './env/.env.dev' });
const sql = require('mssql');

async function fixGoPest() {
  const connectionString = process.env.SQL_CONNECTION_STRING;
  
  try {
    const pool = await sql.connect(connectionString);
    
    const result = await pool.request()
      .query(`
        UPDATE matters 
        SET [Responsible Solicitor] = 'Jonathan Waters'
        WHERE [Display Number] = 'GO PE1421-03663'
      `);
    console.log('GO PE1421-03663 -> Jonathan Waters:', result.rowsAffected[0], 'rows');
    
    await pool.close();
  } catch (err) {
    console.error('Query error:', err.message);
  }
}

fixGoPest();
