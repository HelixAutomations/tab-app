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

async function expandFeeEarnerColumn() {
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
    
    console.log('Expanding fee_earner columns to support longer names...');
    
    // Expand boardroom_bookings fee_earner column
    await sql.query(`ALTER TABLE [dbo].[boardroom_bookings] ALTER COLUMN [fee_earner] NVARCHAR(255) NOT NULL`);
    console.log('✅ Expanded boardroom_bookings.fee_earner column');
    
    // Expand soundproofpod_bookings fee_earner column
    await sql.query(`ALTER TABLE [dbo].[soundproofpod_bookings] ALTER COLUMN [fee_earner] NVARCHAR(255) NOT NULL`);
    console.log('✅ Expanded soundproofpod_bookings.fee_earner column');
    
    console.log('✅ Column expansion completed');
    
  } catch (error) {
    console.error('❌ Error expanding columns:', error);
  } finally {
    await sql.close();
  }
}

expandFeeEarnerColumn();