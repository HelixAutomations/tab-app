const sql = require('mssql');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

async function checkDateFields() {
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

    // Check the date fields for ID 28609
    console.log('=== DATE FIELD COMPARISON FOR ID 28609 ===');
    const dateComparison = await sql.query`
      SELECT 
        ID,
        First_Name,
        Last_Name,
        Touchpoint_Date,
        Date_Created,
        DATEDIFF(day, Date_Created, Touchpoint_Date) as days_difference
      FROM enquiries 
      WHERE ID = '28609'
      ORDER BY Touchpoint_Date DESC
    `;
    
    console.log(`Total records: ${dateComparison.recordset.length}\n`);
    
    dateComparison.recordset.forEach((record, index) => {
      console.log(`--- Record ${index + 1} ---`);
      console.log(`Name: ${record.First_Name} ${record.Last_Name}`);
      console.log(`Touchpoint_Date: ${record.Touchpoint_Date}`);
      console.log(`Date_Created: ${record.Date_Created}`);
      console.log(`Difference: ${record.days_difference} days`);
      console.log('');
    });

    // Check how many would be filtered by 12-month Date_Created filter
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    const dateFromStr = twelveMonthsAgo.toISOString().split('T')[0];
    
    console.log('=== 12-MONTH FILTER ANALYSIS ===');
    console.log(`Filtering by Date_Created >= ${dateFromStr}`);
    
    const filteredByCreated = await sql.query`
      SELECT COUNT(*) as count
      FROM enquiries 
      WHERE ID = '28609'
        AND Date_Created >= ${dateFromStr}
    `;
    
    const filteredByTouchpoint = await sql.query`
      SELECT COUNT(*) as count
      FROM enquiries 
      WHERE ID = '28609'
        AND Touchpoint_Date >= ${dateFromStr}
    `;
    
    console.log(`Records with Date_Created >= ${dateFromStr}: ${filteredByCreated.recordset[0].count}`);
    console.log(`Records with Touchpoint_Date >= ${dateFromStr}: ${filteredByTouchpoint.recordset[0].count}`);
    console.log(`Records excluded by Date_Created filter: ${dateComparison.recordset.length - filteredByCreated.recordset[0].count}`);

    // Show which specific records would be excluded
    const excludedRecords = await sql.query`
      SELECT 
        ID,
        First_Name,
        Last_Name,
        Touchpoint_Date,
        Date_Created
      FROM enquiries 
      WHERE ID = '28609'
        AND Date_Created < ${dateFromStr}
      ORDER BY Date_Created DESC
    `;
    
    if (excludedRecords.recordset.length > 0) {
      console.log('\n=== RECORDS EXCLUDED BY DATE_CREATED FILTER ===');
      excludedRecords.recordset.forEach((record, index) => {
        console.log(`${index + 1}. ${record.First_Name} ${record.Last_Name}`);
        console.log(`   Touchpoint: ${record.Touchpoint_Date}`);
        console.log(`   Created: ${record.Date_Created}`);
      });
    }

    await sql.close();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

checkDateFields();