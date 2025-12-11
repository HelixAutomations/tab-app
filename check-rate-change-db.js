// Quick script to check rate_change_notifications table
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function main() {
    const connStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
    
    if (!connStr) {
        console.error('No connection string found');
        return;
    }
    
    try {
        const pool = await sql.connect(connStr);
        const result = await pool.request().query(`
            SELECT * FROM rate_change_notifications 
            ORDER BY created_at DESC
        `);
        
        console.log('\n=== rate_change_notifications ===\n');
        console.log('Total records:', result.recordset.length);
        
        if (result.recordset.length > 0) {
            console.log('\n');
            result.recordset.forEach((r, i) => {
                console.log(`════════════════════════════════════════════════════════════`);
                console.log(`RECORD ${i+1}`);
                console.log(`════════════════════════════════════════════════════════════`);
                Object.keys(r).forEach(key => {
                    const value = r[key];
                    const displayValue = value === null || value === undefined ? '(null)' : value;
                    console.log(`  ${key.padEnd(20)}: ${displayValue}`);
                });
                console.log('');
            });
        } else {
            console.log('\nNo records found - table is empty');
        }
        
        await pool.close();
    } catch (err) {
        console.error('Error:', err.message);
    }
}

main();
