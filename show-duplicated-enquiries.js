const sql = require('mssql');
const { DefaultAzureCredential } = require('@azure/identity');
const { SecretClient } = require('@azure/keyvault-secrets');

async function showDuplicatedEnquiries() {
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

    // Get all duplicated enquiries with details
    console.log('=== DUPLICATED ENQUIRIES IN LEGACY DATABASE ===\n');
    
    const duplicatedEnquiries = await sql.query`
      WITH DuplicatedIDs AS (
        SELECT ID, COUNT(*) as DuplicateCount
        FROM enquiries 
        GROUP BY ID 
        HAVING COUNT(*) > 1
      )
      SELECT 
        e.ID,
        e.Date_Created,
        e.Touchpoint_Date,
        e.First_Name,
        e.Last_Name,
        e.Email,
        e.Point_of_Contact,
        e.Area_of_Work,
        e.Initial_first_call_notes,
        d.DuplicateCount,
        ROW_NUMBER() OVER (PARTITION BY e.ID ORDER BY e.Date_Created) as RowNum
      FROM enquiries e
      INNER JOIN DuplicatedIDs d ON e.ID = d.ID
      ORDER BY d.DuplicateCount DESC, e.ID, e.Date_Created
    `;

    let currentId = '';
    let groupCount = 0;

    duplicatedEnquiries.recordset.forEach(record => {
      if (record.ID !== currentId) {
        if (currentId !== '') {
          console.log(''); // Empty line between groups
        }
        currentId = record.ID;
        groupCount++;
        console.log(`\n🔴 ID ${record.ID} (${record.DuplicateCount} duplicates):`);
        console.log('─'.repeat(80));
      }

      const dateCreated = record.Date_Created?.toISOString()?.split('T')[0] || 'N/A';
      const touchpointDate = record.Touchpoint_Date?.toISOString()?.split('T')[0] || 'N/A';
      const name = `${record.First_Name || ''} ${record.Last_Name || ''}`.trim() || 'No name';
      const email = record.Email || 'No email';
      const poc = record.Point_of_Contact || 'Unassigned';
      const aow = record.Area_of_Work || 'No AOW';
      const notes = record.Initial_first_call_notes ? 
        (record.Initial_first_call_notes.length > 80 ? 
         record.Initial_first_call_notes.substring(0, 80) + '...' : 
         record.Initial_first_call_notes) : 'No notes';

      console.log(`  ${record.RowNum}. ${name}`);
      console.log(`     📧 ${email}`);
      console.log(`     📅 Created: ${dateCreated} | Touchpoint: ${touchpointDate}`);
      console.log(`     👤 POC: ${poc} | 🏢 AOW: ${aow}`);
      console.log(`     📝 ${notes}`);
      console.log('');
    });

    // Summary statistics
    const summaryStats = await sql.query`
      WITH DuplicatedIDs AS (
        SELECT ID, COUNT(*) as DuplicateCount
        FROM enquiries 
        GROUP BY ID 
        HAVING COUNT(*) > 1
      )
      SELECT 
        COUNT(*) as TotalDuplicatedIDs,
        SUM(DuplicateCount) as TotalDuplicatedRecords,
        MAX(DuplicateCount) as MaxDuplicates,
        AVG(CAST(DuplicateCount as float)) as AvgDuplicatesPerID
      FROM DuplicatedIDs
    `;

    const stats = summaryStats.recordset[0];
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 SUMMARY STATISTICS');
    console.log('='.repeat(80));
    console.log(`Total IDs with duplicates: ${stats.TotalDuplicatedIDs}`);
    console.log(`Total duplicated records: ${stats.TotalDuplicatedRecords}`);
    console.log(`Maximum duplicates for single ID: ${stats.MaxDuplicates}`);
    console.log(`Average duplicates per ID: ${stats.AvgDuplicatesPerID.toFixed(2)}`);

    // Show top offenders
    console.log('\n🚨 TOP 10 WORST OFFENDERS:');
    console.log('-'.repeat(50));
    
    const topOffenders = await sql.query`
      SELECT TOP 10
        ID, 
        COUNT(*) as DuplicateCount,
        MIN(Date_Created) as FirstCreated,
        MAX(Date_Created) as LastCreated,
        DATEDIFF(day, MIN(Date_Created), MAX(Date_Created)) as DaySpread
      FROM enquiries 
      GROUP BY ID 
      HAVING COUNT(*) > 1 
      ORDER BY COUNT(*) DESC
    `;

    topOffenders.recordset.forEach((record, index) => {
      const firstDate = record.FirstCreated?.toISOString()?.split('T')[0] || 'N/A';
      const lastDate = record.LastCreated?.toISOString()?.split('T')[0] || 'N/A';
      console.log(`${index + 1}. ID ${record.ID}: ${record.DuplicateCount} records (${firstDate} to ${lastDate}, ${record.DaySpread} days)`);
    });

    // Check for different types of duplicates
    console.log('\n🔍 DUPLICATE PATTERNS ANALYSIS:');
    console.log('-'.repeat(50));

    const patternAnalysis = await sql.query`
      WITH DuplicatedIDs AS (
        SELECT ID, COUNT(*) as DuplicateCount
        FROM enquiries 
        GROUP BY ID 
        HAVING COUNT(*) > 1
      ),
      DuplicateAnalysis AS (
        SELECT 
          e.ID,
          COUNT(DISTINCT e.Email) as UniqueEmails,
          COUNT(DISTINCT CONCAT(e.First_Name, ' ', e.Last_Name)) as UniqueNames,
          COUNT(DISTINCT e.Point_of_Contact) as UniquePOCs,
          COUNT(DISTINCT e.Area_of_Work) as UniqueAOWs,
          COUNT(*) as TotalRecords
        FROM enquiries e
        INNER JOIN DuplicatedIDs d ON e.ID = d.ID
        GROUP BY e.ID
      )
      SELECT 
        SUM(CASE WHEN UniqueEmails = 1 THEN 1 ELSE 0 END) as SameEmailDifferentPeople,
        SUM(CASE WHEN UniqueNames = 1 THEN 1 ELSE 0 END) as SamePersonMultipleRecords,
        SUM(CASE WHEN UniquePOCs > 1 THEN 1 ELSE 0 END) as DifferentPOCs,
        SUM(CASE WHEN UniqueAOWs > 1 THEN 1 ELSE 0 END) as DifferentAOWs,
        COUNT(*) as TotalDuplicatedIDs
      FROM DuplicateAnalysis
    `;

    const patterns = patternAnalysis.recordset[0];
    console.log(`Same email, different people: ${patterns.SameEmailDifferentPeople}`);
    console.log(`Same person, multiple records: ${patterns.SamePersonMultipleRecords}`);
    console.log(`Different POCs assigned: ${patterns.DifferentPOCs}`);
    console.log(`Different Areas of Work: ${patterns.DifferentAOWs}`);

    await sql.close();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

showDuplicatedEnquiries();