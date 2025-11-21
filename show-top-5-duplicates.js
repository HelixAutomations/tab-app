const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');
const sql = require('mssql');

async function showTop5Duplicates() {
  console.log('🔍 Analyzing top 5 duplicate IDs in legacy enquiries database...\n');

  try {
    // Use local connection string for development
    const connectionString = "Server=(localdb)\\MSSQLLocalDB;Database=helix-core-data;Trusted_Connection=yes;";

    // Connect to database
    await sql.connect(connectionString);
    console.log('✅ Connected to helix-core-data database\n');

    // Query for top 5 duplicate IDs with full details
    const query = `
      WITH DuplicateCounts AS (
        SELECT 
          ID,
          COUNT(*) as duplicate_count,
          MIN([Date Created]) as earliest_date,
          MAX([Date Created]) as latest_date,
          DATEDIFF(day, MIN([Date Created]), MAX([Date Created])) as day_span
        FROM enquiries 
        WHERE ID IS NOT NULL
        GROUP BY ID
        HAVING COUNT(*) > 1
      ),
      Top5Duplicates AS (
        SELECT TOP 5 *
        FROM DuplicateCounts
        ORDER BY duplicate_count DESC
      )
      SELECT 
        e.ID,
        e.[First Name],
        e.[Last Name], 
        e.Email,
        e.[Date Created],
        e.[Last Touchpoint],
        e.[Point of Contact],
        e.[Area of Work],
        e.Notes,
        dc.duplicate_count,
        dc.day_span,
        ROW_NUMBER() OVER (PARTITION BY e.ID ORDER BY e.[Date Created]) as record_num
      FROM enquiries e
      INNER JOIN Top5Duplicates dc ON e.ID = dc.ID
      ORDER BY dc.duplicate_count DESC, e.ID, e.[Date Created]
    `;

    const result = await sql.query(query);

    let currentId = null;
    let recordCount = 0;

    console.log('🚨 TOP 5 DUPLICATE IDs - DETAILED BREAKDOWN');
    console.log('════════════════════════════════════════════════════════════════════════════════\n');

    for (const record of result.recordset) {
      if (currentId !== record.ID) {
        if (currentId !== null) {
          console.log('\n────────────────────────────────────────────────────────────────────────────────\n');
        }
        
        currentId = record.ID;
        recordCount = 1;
        
        console.log(`🔴 ID ${record.ID} (${record.duplicate_count} total records - span: ${record.day_span} days)`);
        console.log('────────────────────────────────────────────────────────────────────────────────');
      }

      const firstName = record['First Name'] || 'Unknown';
      const lastName = record['Last Name'] || 'Unknown';
      const email = record.Email || 'No email';
      const dateCreated = record['Date Created'] ? record['Date Created'].toISOString().split('T')[0] : 'Unknown';
      const lastTouchpoint = record['Last Touchpoint'] ? record['Last Touchpoint'].toISOString().split('T')[0] : 'Unknown';
      const poc = record['Point of Contact'] || 'No POC';
      const aow = record['Area of Work'] || 'No AOW';
      const notes = record.Notes ? record.Notes.substring(0, 80) + (record.Notes.length > 80 ? '...' : '') : 'No notes';

      console.log(`  ${recordCount}. ${firstName} ${lastName}`);
      console.log(`     📧 ${email}`);
      console.log(`     📅 Created: ${dateCreated} | Touchpoint: ${lastTouchpoint}`);
      console.log(`     👤 POC: ${poc} | 🏢 AOW: ${aow}`);
      console.log(`     📝 ${notes}`);
      console.log('');
      
      recordCount++;
    }

    // Get summary statistics
    const summaryQuery = `
      SELECT 
        COUNT(DISTINCT ID) as total_duplicate_ids,
        SUM(CASE WHEN cnt > 1 THEN cnt ELSE 0 END) as total_duplicate_records,
        MAX(cnt) as max_duplicates
      FROM (
        SELECT ID, COUNT(*) as cnt
        FROM enquiries 
        WHERE ID IS NOT NULL
        GROUP BY ID
      ) subq
      WHERE cnt > 1
    `;

    const summaryResult = await sql.query(summaryQuery);
    const summary = summaryResult.recordset[0];

    console.log('\n📊 LEGACY DATABASE DUPLICATE SUMMARY');
    console.log('════════════════════════════════════════════════════════════════════════════════');
    console.log(`Total IDs with duplicates: ${summary.total_duplicate_ids}`);
    console.log(`Total duplicate records: ${summary.total_duplicate_records}`);
    console.log(`Worst single ID: ${summary.max_duplicates} duplicates`);
    console.log(`\n💡 This represents a ${((summary.total_duplicate_records / 28571) * 100).toFixed(1)}% duplication rate in your legacy database`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code) {
      console.error('Error code:', error.code);
    }
  } finally {
    await sql.close();
    console.log('\n✅ Database connection closed');
  }
}

showTop5Duplicates();