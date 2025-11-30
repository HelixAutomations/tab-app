const sql = require('mssql');
require('dotenv').config();

async function query() {
    try {
        await sql.connect(process.env.INSTRUCTIONS_SQL_CONNECTION_STRING);
        
        // Search for Commercial Test by name
        const result = await sql.query`SELECT id, first, last, email, phone, aow, stage, poc, claim FROM dbo.enquiries WHERE first LIKE '%Commercial%' OR last LIKE '%Test%'`;
        console.log('Commercial Test enquiries:');
        console.table(result.recordset);
        
        // Also show ID 591 full record
        const r591 = await sql.query`SELECT * FROM dbo.enquiries WHERE id = 591`;
        console.log('\nFull record for ID 591:');
        console.log(JSON.stringify(r591.recordset[0], null, 2));
        
        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

query();
