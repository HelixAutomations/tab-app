const sql = require('mssql');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

async function queryAllRecords() {
  try {
    // Get password from Azure Key Vault
    const kvUri = "https://helix-keys.vault.azure.net/";
    const passwordSecretName = "sql-databaseserver-password";
    const secretClient = new SecretClient(kvUri, new DefaultAzureCredential());
    const passwordSecret = await secretClient.getSecret(passwordSecretName);
    const password = passwordSecret.value;

    const config = {
      user: 'helix-database-server',
      password: password,
      server: 'helix-database-server.database.windows.net',
      database: 'helix-core-data',
      options: {
        encrypt: true,
        trustServerCertificate: false
      }
    };

    await sql.connect(config);
    console.log('Connected to helix-core-data database\n');

    // Query ALL records for ID 28609
    console.log('=== ALL RECORDS FOR ID 28609 ===');
    const allRecords = await sql.query`
      SELECT 
        ID,
        Touchpoint_Date,
        First_Name,
        Last_Name, 
        Email,
        Point_of_Contact,
        Area_of_Work,
        Value,
        Method_of_Contact,
        Initial_first_call_notes,
        Date_Created
      FROM enquiries 
      WHERE ID = '28609'
      ORDER BY Touchpoint_Date DESC, Date_Created DESC
    `;
    
    console.log(`Total records found: ${allRecords.recordset.length}`);
    console.log('\nDetailed records:');
    allRecords.recordset.forEach((record, index) => {
      console.log(`\n--- Record ${index + 1} ---`);
      console.log(`ID: ${record.ID}`);
      console.log(`Date: ${record.Touchpoint_Date}`);
      console.log(`Name: ${record.First_Name} ${record.Last_Name}`);
      console.log(`Email: ${record.Email}`);
      console.log(`POC: ${record.Point_of_Contact}`);
      console.log(`Area: ${record.Area_of_Work}`);
      console.log(`Value: ${record.Value}`);
      console.log(`Created: ${record.Date_Created}`);
      console.log(`Notes: ${record.Initial_first_call_notes ? record.Initial_first_call_notes.substring(0, 100) + '...' : 'None'}`);
    });

    // Check date ranges
    console.log('\n=== DATE ANALYSIS ===');
    const dateRange = await sql.query`
      SELECT 
        MIN(Touchpoint_Date) as earliest_date,
        MAX(Touchpoint_Date) as latest_date,
        COUNT(*) as total_count
      FROM enquiries 
      WHERE ID = '28609'
    `;
    
    console.log('Date range:', dateRange.recordset[0]);
    
    // Check how many are within 12 months
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    const dateFromStr = twelveMonthsAgo.toISOString().split('T')[0];
    
    const recent = await sql.query`
      SELECT COUNT(*) as recent_count
      FROM enquiries 
      WHERE ID = '28609'
        AND Touchpoint_Date >= ${dateFromStr}
    `;
    
    console.log(`Records within 12 months (since ${dateFromStr}): ${recent.recordset[0].recent_count}`);
    console.log(`Records older than 12 months: ${allRecords.recordset.length - recent.recordset[0].recent_count}`);

    // Check email distribution
    console.log('\n=== EMAIL ANALYSIS ===');
    const emailDist = await sql.query`
      SELECT 
        Email,
        COUNT(*) as count
      FROM enquiries 
      WHERE ID = '28609'
      GROUP BY Email
      ORDER BY COUNT(*) DESC
    `;
    
    console.log('Email distribution:');
    emailDist.recordset.forEach(row => {
      console.log(`  ${row.Email || 'NULL'}: ${row.count} records`);
    });

    await sql.close();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

queryAllRecords();