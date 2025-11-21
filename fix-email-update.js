const sql = require('mssql');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

async function fixEmailUpdate() {
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

    // Step 1: Revert all records back to prospects@helix-law.com EXCEPT the actual Matt Talaie
    console.log('=== REVERTING INCORRECT UPDATES ===');
    const revertResult = await sql.query`
      UPDATE enquiries
      SET Email = 'prospects@helix-law.com'
      WHERE ID = '28609'
        AND Email = 'Mat.Talaie@hotmail.com'
        AND NOT (First_Name = 'Matt' AND Last_Name = 'Talaie')
    `;

    console.log(`Reverted ${revertResult.rowsAffected[0]} incorrect records back to prospects@helix-law.com`);

    // Step 2: Verify only Matt Talaie has the new email
    console.log('\n=== VERIFYING MATT TALAIE RECORD ===');
    const mattResult = await sql.query`
      SELECT ID, Email, First_Name, Last_Name, Point_of_Contact, Date_Created
      FROM enquiries 
      WHERE First_Name = 'Matt' 
        AND Last_Name = 'Talaie'
        AND ID = '28609'
    `;

    if (mattResult.recordset.length > 0) {
      console.log('Matt Talaie record:');
      console.log(JSON.stringify(mattResult.recordset[0], null, 2));
    }

    // Step 3: Final verification - count records with Mat.Talaie@hotmail.com
    console.log('\n=== FINAL EMAIL COUNT CHECK ===');
    const finalCountResult = await sql.query`
      SELECT COUNT(*) as count
      FROM enquiries 
      WHERE Email = 'Mat.Talaie@hotmail.com'
    `;
    
    console.log(`Records with Mat.Talaie@hotmail.com: ${finalCountResult.recordset[0].count}`);

    // Step 4: Show who still has the new email
    const remainingResult = await sql.query`
      SELECT ID, Email, First_Name, Last_Name, Point_of_Contact, Date_Created
      FROM enquiries 
      WHERE Email = 'Mat.Talaie@hotmail.com'
    `;

    console.log('\n=== RECORDS WITH MAT.TALAIE@HOTMAIL.COM ===');
    remainingResult.recordset.forEach((record, index) => {
      console.log(`Record ${index + 1}:`);
      console.log(`${record.First_Name} ${record.Last_Name} (ID: ${record.ID})`);
    });

    if (finalCountResult.recordset[0].count === 1) {
      console.log('\n✅ Fixed! Only Matt Talaie now has Mat.Talaie@hotmail.com');
    } else {
      console.log('\n❌ Issue still exists - multiple people have the email');
    }

    await sql.close();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

fixEmailUpdate();