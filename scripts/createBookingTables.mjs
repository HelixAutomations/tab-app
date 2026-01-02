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

async function createBookingTables() {
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
    
    // Create boardroom_bookings table
    const boardroomTableSQL = `
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'boardroom_bookings')
      BEGIN
        CREATE TABLE [dbo].[boardroom_bookings] (
          [id] INT IDENTITY(1,1) PRIMARY KEY,
          [fee_earner] NVARCHAR(255) NOT NULL,
          [booking_date] DATE NOT NULL,
          [booking_time] TIME NOT NULL,
          [duration] DECIMAL(10,2) NOT NULL,
          [reason] NVARCHAR(500) NOT NULL,
          [created_at] DATETIME2 DEFAULT GETDATE(),
          [updated_at] DATETIME2 DEFAULT GETDATE()
        );
        PRINT 'Created boardroom_bookings table';
      END
      ELSE
      BEGIN
        PRINT 'boardroom_bookings table already exists';
      END
    `;

    // Create soundproofpod_bookings table  
    const soundproofTableSQL = `
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'soundproofpod_bookings')
      BEGIN
        CREATE TABLE [dbo].[soundproofpod_bookings] (
          [id] INT IDENTITY(1,1) PRIMARY KEY,
          [fee_earner] NVARCHAR(255) NOT NULL,
          [booking_date] DATE NOT NULL,
          [booking_time] TIME NOT NULL,
          [duration] DECIMAL(10,2) NOT NULL,
          [reason] NVARCHAR(500) NOT NULL,
          [created_at] DATETIME2 DEFAULT GETDATE(),
          [updated_at] DATETIME2 DEFAULT GETDATE()
        );
        PRINT 'Created soundproofpod_bookings table';
      END
      ELSE  
      BEGIN
        PRINT 'soundproofpod_bookings table already exists';
      END
    `;

    await sql.query(boardroomTableSQL);
    await sql.query(soundproofTableSQL);
    
    console.log('✅ Space booking tables created successfully');
    
  } catch (error) {
    console.error('❌ Error creating tables:', error);
  } finally {
    await sql.close();
  }
}

createBookingTables();