const sql = require('mssql');

async function investigateInstructionsSchema() {
  try {
    const config = {
      user: 'instructionsadmin',
      password: 'qG?-hTyfhsWE0,,}uJB,',
      server: 'instructions.database.windows.net',
      database: 'instructions',
      options: {
        encrypt: true,
        trustServerCertificate: false
      }
    };

    await sql.connect(config);
    console.log('Connected to instructions database\n');

    // Check enquiries table schema in instructions DB
    console.log('=== INSTRUCTIONS ENQUIRIES SCHEMA ===');
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

    // Check identity properties
    const identityCheck = await sql.query`
      SELECT 
        COLUMNPROPERTY(OBJECT_ID('enquiries'), 'id', 'IsIdentity') as IsIdentity,
        IDENT_SEED('enquiries') as IdentitySeed,
        IDENT_INCR('enquiries') as IdentityIncrement
    `;

    console.log('\n=== ID COLUMN IDENTITY CHECK ===');
    console.log('Identity properties:', identityCheck.recordset[0]);

    // Get recent records from instructions
    console.log('\n=== RECENT INSTRUCTIONS RECORDS ===');
    const recentRecords = await sql.query`
      SELECT TOP 10
        id,
        datetime,
        first,
        last,
        email
      FROM enquiries
      ORDER BY id DESC
    `;

    recentRecords.recordset.forEach(record => {
      console.log(`  ID: ${record.id} | ${record.datetime?.toISOString()?.split('T')[0]} | ${record.first} ${record.last} | ${record.email}`);
    });

    await sql.close();
  } catch (err) {
    console.error('Error:', err);
  }
}

investigateInstructionsSchema();