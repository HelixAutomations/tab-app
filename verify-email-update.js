const sql = require('mssql');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

async function verifyEmailUpdate() {
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

    // Check how many records now have Mat.Talaie@hotmail.com
    console.log('=== CHECKING EMAIL COUNT ===');
    const emailCountResult = await sql.query`
      SELECT COUNT(*) as count
      FROM enquiries 
      WHERE Email = 'Mat.Talaie@hotmail.com'
    `;
    
    console.log(`Records with Mat.Talaie@hotmail.com: ${emailCountResult.recordset[0].count}`);

    // Show all records with this email
    console.log('\n=== ALL RECORDS WITH MAT.TALAIE@HOTMAIL.COM ===');
    const allRecordsResult = await sql.query`
      SELECT ID, Email, First_Name, Last_Name, Point_of_Contact, Date_Created
      FROM enquiries 
      WHERE Email = 'Mat.Talaie@hotmail.com'
      ORDER BY ID
    `;

    allRecordsResult.recordset.forEach((record, index) => {
      console.log(`Record ${index + 1}:`);
      console.log(JSON.stringify(record, null, 2));
      console.log('---');
    });

    // Check if any records still have prospects@helix-law.com
    console.log('\n=== CHECKING FOR REMAINING PROSPECTS@HELIX-LAW.COM ===');
    const remainingProspectsResult = await sql.query`
      SELECT COUNT(*) as count
      FROM enquiries 
      WHERE Email = 'prospects@helix-law.com'
    `;
    
    console.log(`Records still with prospects@helix-law.com: ${remainingProspectsResult.recordset[0].count}`);

    await sql.close();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

verifyEmailUpdate();