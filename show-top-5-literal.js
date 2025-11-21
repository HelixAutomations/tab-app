const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const sql = require('mssql');

async function showTop5DuplicatesLiteral() {
  console.log('🔍 Showing literal records for top 5 duplicate IDs...\n');

  try {
    // Use local connection string for development
    const connectionString = "Server=(localdb)\\MSSQLLocalDB;Database=helix-core-data;Trusted_Connection=yes;";

    // Connect to database
    await sql.connect(connectionString);
    console.log('✅ Connected to helix-core-data database\n');

    // Get top 5 duplicate IDs first
    const top5Query = `
      SELECT TOP 5 ID, COUNT(*) as duplicate_count
      FROM enquiries 
      WHERE ID IS NOT NULL
      GROUP BY ID
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
    `;

    const top5Result = await sql.query(top5Query);
    const top5IDs = top5Result.recordset.map(r => r.ID);

    console.log('📋 TOP 5 DUPLICATE IDs - LITERAL RECORDS');
    console.log('════════════════════════════════════════════════════════════════════════════════\n');

    // For each top 5 ID, get all records
    for (let i = 0; i < top5IDs.length; i++) {
      const targetId = top5IDs[i];
      
      const recordsQuery = `
        SELECT 
          [First Name],
          [Last Name], 
          Email,
          [Date Created],
          [Point of Contact],
          [Area of Work]
        FROM enquiries 
        WHERE ID = '${targetId}'
        ORDER BY [Date Created]
      `;

      const recordsResult = await sql.query(recordsQuery);
      const records = recordsResult.recordset;

      console.log(`🔴 ID ${targetId} (${records.length} records):`);
      console.log('────────────────────────────────────────────────────────────────────────────────');

      records.forEach((record, index) => {
        const firstName = record['First Name'] || 'Unknown';
        const lastName = record['Last Name'] || 'Unknown';
        const email = record.Email || 'No email';
        const dateCreated = record['Date Created'] ? record['Date Created'].toISOString().split('T')[0] : 'Unknown';
        const poc = record['Point of Contact'] || 'No POC';
        const aow = record['Area of Work'] || 'No AOW';

        console.log(`  ${index + 1}. ${firstName} ${lastName} | ${email}`);
        console.log(`     📅 ${dateCreated} | 👤 ${poc} | 🏢 ${aow}`);
      });

      console.log('\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
  } finally {
    await sql.close();
    console.log('✅ Database connection closed');
  }
}

showTop5DuplicatesLiteral();