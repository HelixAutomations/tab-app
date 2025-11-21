const sql = require('mssql');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

async function investigateEnquiriesSchema() {
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

    // Check enquiries table schema
    console.log('=== ENQUIRIES TABLE SCHEMA ===');
    const schemaResult = await sql.query`
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        IS_NULLABLE,
        COLUMN_DEFAULT,
        CHARACTER_MAXIMUM_LENGTH,
        NUMERIC_PRECISION,
        COLUMNPROPERTY(OBJECT_ID('enquiries'), COLUMN_NAME, 'IsIdentity') as IS_IDENTITY
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'enquiries'
      ORDER BY ORDINAL_POSITION
    `;

    schemaResult.recordset.forEach(col => {
      console.log(`${col.COLUMN_NAME}: ${col.DATA_TYPE}${col.CHARACTER_MAXIMUM_LENGTH ? `(${col.CHARACTER_MAXIMUM_LENGTH})` : ''}${col.IS_IDENTITY ? ' IDENTITY' : ''} ${col.IS_NULLABLE === 'NO' ? 'NOT NULL' : 'NULL'} ${col.COLUMN_DEFAULT ? `DEFAULT ${col.COLUMN_DEFAULT}` : ''}`);
    });

    // Check if ID column is identity
    const identityCheck = await sql.query`
      SELECT 
        COLUMNPROPERTY(OBJECT_ID('enquiries'), 'ID', 'IsIdentity') as IsIdentity,
        IDENT_SEED('enquiries') as IdentitySeed,
        IDENT_INCR('enquiries') as IdentityIncrement
    `;

    console.log('\n=== ID COLUMN IDENTITY CHECK ===');
    console.log('Identity properties:', identityCheck.recordset[0] || 'No ID column found');

    // Get sample of records with ID distribution
    console.log('\n=== ID DISTRIBUTION ANALYSIS ===');
    const idAnalysis = await sql.query`
      SELECT 
        MIN(CAST(ID AS bigint)) as MinID,
        MAX(CAST(ID AS bigint)) as MaxID,
        COUNT(*) as TotalRecords,
        COUNT(DISTINCT ID) as UniqueIDs
      FROM enquiries
      WHERE ISNUMERIC(ID) = 1
    `;

    console.log('ID Statistics:', idAnalysis.recordset[0]);

    // Find duplicate IDs
    console.log('\n=== DUPLICATE ID ANALYSIS ===');
    const duplicateIds = await sql.query`
      SELECT 
        ID, 
        COUNT(*) as DuplicateCount,
        MIN(Date_Created) as FirstCreated,
        MAX(Date_Created) as LastCreated
      FROM enquiries 
      GROUP BY ID 
      HAVING COUNT(*) > 1 
      ORDER BY COUNT(*) DESC
    `;

    console.log(`Found ${duplicateIds.recordset.length} IDs with duplicates:`);
    duplicateIds.recordset.slice(0, 10).forEach(dup => {
      console.log(`  ID ${dup.ID}: ${dup.DuplicateCount} records (${dup.FirstCreated?.toISOString()?.split('T')[0]} to ${dup.LastCreated?.toISOString()?.split('T')[0]})`);
    });

    // Check recent ID patterns
    console.log('\n=== RECENT ID PATTERNS ===');
    const recentIds = await sql.query`
      SELECT TOP 20
        ID,
        Date_Created,
        First_Name,
        Last_Name,
        Email,
        ROW_NUMBER() OVER (ORDER BY Date_Created DESC) as RowNum
      FROM enquiries
      WHERE Date_Created >= DATEADD(day, -7, GETDATE())
      ORDER BY Date_Created DESC
    `;

    recentIds.recordset.forEach(record => {
      console.log(`  ${record.ID} | ${record.Date_Created?.toISOString()?.split('T')[0]} | ${record.First_Name} ${record.Last_Name} | ${record.Email}`);
    });

    // Check for specific problematic ID
    console.log('\n=== ID 28609 DETAILED ANALYSIS ===');
    const id28609Records = await sql.query`
      SELECT 
        ID,
        Date_Created,
        First_Name,
        Last_Name,
        Email,
        Point_of_Contact,
        CASE 
          WHEN ISNUMERIC(ID) = 1 THEN 'Numeric'
          ELSE 'String'
        END as IDType
      FROM enquiries 
      WHERE ID = '28609'
      ORDER BY Date_Created
    `;

    console.log(`Records with ID 28609: ${id28609Records.recordset.length}`);
    id28609Records.recordset.forEach((record, index) => {
      console.log(`  ${index + 1}. ${record.First_Name} ${record.Last_Name} (${record.Email}) - ${record.Date_Created?.toISOString()?.split('T')[0]} - ${record.IDType} ID`);
    });

    await sql.close();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

investigateEnquiriesSchema();