import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import sql from 'mssql';

const KV_URI = "https://helix-keys.vault.azure.net/";

async function getSqlPassword() {
  try {
    const credential = new DefaultAzureCredential();
    const client = new SecretClient(KV_URI, credential);
    const secretResponse = await client.getSecret("sql-databaseserver-password");
    return secretResponse.value;
  } catch (error) {
    console.error("Failed to retrieve SQL password:", error);
    process.exit(1);
  }
}

async function deleteTestBookings() {
  const password = await getSqlPassword();
  
  const config = {
    server: 'helix-database-server.database.windows.net',
    database: 'helix-project-data',
    user: 'helix-database-server',
    password: password,
    options: {
      encrypt: true,
      trustServerCertificate: false,
    },
  };

  try {
    await sql.connect(config);
    
    console.log('Deleting test booking entries...');
    
    // Delete boardroom test bookings (IDs 40, 41)
    const boardroomResult = await sql.query(`
      DELETE FROM [dbo].[boardroom_bookings] 
      WHERE id IN (40, 41) AND fee_earner = 'LW'
    `);
    console.log(`✅ Deleted ${boardroomResult.rowsAffected[0]} boardroom booking(s)`);
    
    // Delete soundproof pod test booking (ID 14)
    const podResult = await sql.query(`
      DELETE FROM [dbo].[soundproofpod_bookings] 
      WHERE id = 14 AND fee_earner = 'JS'
    `);
    console.log(`✅ Deleted ${podResult.rowsAffected[0]} soundproof pod booking(s)`);
    
    console.log('✅ Test bookings deleted successfully');
    
  } catch (error) {
    console.error('❌ Error deleting bookings:', error);
  } finally {
    await sql.close();
  }
}

deleteTestBookings();