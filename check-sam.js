// Quick script to check Sam's name in the database
require('dotenv').config();
const sql = require('mssql');

async function check() {
    const conn = process.env.SQL_CONNECTION_STRING_LEGACY || process.env.SQL_CONNECTION_STRING;
    const pool = await sql.connect(conn);
    
    // Get distinct responsible solicitors
    const result = await pool.request().query(`
        SELECT DISTINCT [Responsible Solicitor] as name
        FROM matters
        WHERE [Status] = 'Open'
        AND ([Responsible Solicitor] LIKE '%Sam%' OR [Responsible Solicitor] LIKE '%Packwood%')
        ORDER BY [Responsible Solicitor]
    `);
    
    console.log('Solicitors matching Sam/Packwood in open matters:');
    result.recordset.forEach(r => console.log(`  - "${r.name}"`));
    
    // Check the team table for Sam's full name
    const usersResult = await pool.request().query(`
        SELECT [Full Name], [Email], [Initials], [First], [Last], [Nickname]
        FROM team
        WHERE [Full Name] LIKE '%Sam%' OR [Full Name] LIKE '%Packwood%'
           OR [First] LIKE '%Sam%' OR [Last] LIKE '%Packwood%'
    `);
    
    console.log('\nTeam members matching Sam/Packwood:');
    usersResult.recordset.forEach(r => console.log(`  - Full Name: "${r['Full Name']}", First: "${r.First}", Last: "${r.Last}", Nickname: "${r.Nickname}", Initials: "${r.Initials}"`));
    
    await pool.close();
}

check().catch(console.error);
