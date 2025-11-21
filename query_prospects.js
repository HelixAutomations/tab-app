const sql = require('mssql');

async function queryProspectsEmail() {
    try {
        const config = {
            server: 'helix-database-server.database.windows.net',
            database: 'helix-core-data',
            authentication: {
                type: 'azure-active-directory-default'
            },
            options: {
                encrypt: true,
                trustServerCertificate: false
            }
        };

        await sql.connect(config);
        console.log('Connected to database');

        // Query all prospects@ emails
        const result1 = await sql.query`
            SELECT TOP 50 
                ID, 
                Email, 
                [First Name], 
                [Last Name], 
                [Touchpoint Date], 
                [Area of Work], 
                [Estimated Value]
            FROM enquiries 
            WHERE Email LIKE '%prospects@%' 
            ORDER BY [Touchpoint Date] DESC
        `;

        console.log('\n=== ALL PROSPECTS@ EMAILS (Top 50) ===');
        console.log(`Found ${result1.recordset.length} records:`);
        result1.recordset.forEach(record => {
            console.log(`ID: ${record.ID}, Name: ${record['First Name']} ${record['Last Name']}, Date: ${record['Touchpoint Date']}, AOW: ${record['Area of Work']}`);
        });

        // Count total
        const result2 = await sql.query`
            SELECT COUNT(*) as TotalProspectsEmails
            FROM enquiries 
            WHERE Email LIKE '%prospects@%'
        `;

        console.log(`\n=== TOTAL COUNT ===`);
        console.log(`Total prospects@ emails: ${result2.recordset[0].TotalProspectsEmails}`);

        // Check specific IDs
        const result3 = await sql.query`
            SELECT 
                ID, 
                Email, 
                [First Name], 
                [Last Name], 
                [Touchpoint Date], 
                [Area of Work]
            FROM enquiries 
            WHERE ID IN ('28609', '23849', '26069')
            ORDER BY [Touchpoint Date] DESC
        `;

        console.log(`\n=== SPECIFIC IDs (28609, 23849, 26069) ===`);
        result3.recordset.forEach(record => {
            console.log(`ID: ${record.ID}, Name: ${record['First Name']} ${record['Last Name']}, Email: ${record.Email}, Date: ${record['Touchpoint Date']}`);
        });

    } catch (err) {
        console.error('Database connection/query failed:', err);
    } finally {
        await sql.close();
    }
}

queryProspectsEmail();