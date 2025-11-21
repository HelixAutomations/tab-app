const sql = require('mssql');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

async function investigateDataInconsistency() {
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

    // Check all records with ID 28609
    console.log('=== ALL RECORDS WITH ID 28609 ===');
    const allRecordsResult = await sql.query`
      SELECT 
        ID, 
        Email, 
        First_Name, 
        Last_Name, 
        Area_of_Work,
        Phone_Number,
        Initial_first_call_notes,
        Date_Created,
        Touchpoint_Date,
        Point_of_Contact
      FROM enquiries 
      WHERE ID = '28609'
      ORDER BY Date_Created DESC
    `;

    allRecordsResult.recordset.forEach((record, index) => {
      console.log(`\nRecord ${index + 1}:`);
      console.log(`Name: ${record.First_Name} ${record.Last_Name}`);
      console.log(`Email: ${record.Email}`);
      console.log(`Area of Work: ${record.Area_of_Work}`);
      console.log(`Phone: ${record.Phone_Number}`);
      console.log(`Notes: ${record.Initial_first_call_notes}`);
      console.log(`Date Created: ${record.Date_Created}`);
      console.log(`Point of Contact: ${record.Point_of_Contact}`);
      console.log('---');
    });

    // Look for Andy Gelder specifically
    console.log('\n=== SEARCHING FOR ANDY GELDER ===');
    const andyResult = await sql.query`
      SELECT 
        ID, 
        Email, 
        First_Name, 
        Last_Name, 
        Area_of_Work,
        Phone_Number,
        Initial_first_call_notes,
        Date_Created,
        Touchpoint_Date,
        Point_of_Contact
      FROM enquiries 
      WHERE First_Name LIKE '%Andy%' 
        AND Last_Name LIKE '%Gelder%'
      ORDER BY Date_Created DESC
    `;

    if (andyResult.recordset.length > 0) {
      andyResult.recordset.forEach((record, index) => {
        console.log(`\nAndy Gelder Record ${index + 1}:`);
        console.log(`ID: ${record.ID}`);
        console.log(`Email: ${record.Email}`);
        console.log(`Area of Work: ${record.Area_of_Work}`);
        console.log(`Notes: ${record.Initial_first_call_notes}`);
        console.log(`Date Created: ${record.Date_Created}`);
        console.log(`Point of Contact: ${record.Point_of_Contact}`);
      });
    } else {
      console.log('No Andy Gelder found in enquiries table');
    }

    // Search for records with "unpaid rent" in notes
    console.log('\n=== SEARCHING FOR UNPAID RENT NOTES ===');
    const rentResult = await sql.query`
      SELECT 
        ID, 
        Email, 
        First_Name, 
        Last_Name, 
        Area_of_Work,
        Phone_Number,
        Initial_first_call_notes,
        Date_Created,
        Touchpoint_Date,
        Point_of_Contact
      FROM enquiries 
      WHERE Initial_first_call_notes LIKE '%unpaid rent%'
         OR Initial_first_call_notes LIKE '%previous tenant%'
      ORDER BY Date_Created DESC
    `;

    if (rentResult.recordset.length > 0) {
      rentResult.recordset.forEach((record, index) => {
        console.log(`\nRent-related Record ${index + 1}:`);
        console.log(`ID: ${record.ID}`);
        console.log(`Name: ${record.First_Name} ${record.Last_Name}`);
        console.log(`Email: ${record.Email}`);
        console.log(`Notes: ${record.Initial_first_call_notes}`);
        console.log(`Date Created: ${record.Date_Created}`);
      });
    } else {
      console.log('No records found with unpaid rent notes');
    }

    await sql.close();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

investigateDataInconsistency();