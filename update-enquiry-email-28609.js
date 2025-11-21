const sql = require('mssql');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

async function updateEnquiryEmail() {
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

    // First, verify the current record
    console.log('=== VERIFYING CURRENT RECORD ===');
    const verifyResult = await sql.query`
      SELECT ID, Email, First_Name, Last_Name, Point_of_Contact, Date_Created
      FROM enquiries 
      WHERE ID = '28609'
        AND Email = 'prospects@helix-law.com'
    `;
    
    if (verifyResult.recordset.length === 0) {
      console.log('❌ No record found with ID 28609 and email prospects@helix-law.com');
      console.log('Update aborted for safety.');
      return;
    }

    console.log('Current record:');
    console.log(JSON.stringify(verifyResult.recordset[0], null, 2));

    // Execute the update
    console.log('\n=== EXECUTING UPDATE ===');
    const updateResult = await sql.query`
      UPDATE enquiries
      SET Email = 'Mat.Talaie@hotmail.com'
      WHERE ID = '28609'
        AND Email = 'prospects@helix-law.com'
    `;

    console.log(`Update executed. Rows affected: ${updateResult.rowsAffected[0]}`);

    // Verify the update was successful
    console.log('\n=== VERIFYING UPDATE ===');
    const postUpdateResult = await sql.query`
      SELECT ID, Email, First_Name, Last_Name, Point_of_Contact, Date_Created
      FROM enquiries 
      WHERE ID = '28609'
    `;

    if (postUpdateResult.recordset.length > 0) {
      console.log('Updated record:');
      console.log(JSON.stringify(postUpdateResult.recordset[0], null, 2));
      
      if (postUpdateResult.recordset[0].Email === 'Mat.Talaie@hotmail.com') {
        console.log('✅ Update successful!');
      } else {
        console.log('❌ Update may have failed - email not updated');
      }
    }

    await sql.close();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

updateEnquiryEmail();