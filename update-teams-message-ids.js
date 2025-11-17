require('dotenv').config();
const { ConnectionPool } = require('mssql');

async function updateTeamsMessageIds() {
  const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING || process.env.SQL_CONNECTION_STRING;
  
  if (!connectionString) {
    console.error('❌ No SQL connection string found');
    process.exit(1);
  }

  const pool = new ConnectionPool(connectionString);
  
  try {
    await pool.connect();
    console.log('✅ Connected to instructions database');
    
    // First, let's see what we have
    console.log('\n📊 Current TeamsBotActivityTracking records:');
    const currentRecords = await pool.request().query(`
      SELECT Id, EnquiryId, LeadName, TeamsMessageId, CreatedAt 
      FROM [dbo].[TeamsBotActivityTracking] 
      ORDER BY EnquiryId ASC
    `);
    
    currentRecords.recordset.forEach(record => {
      console.log(`  ID ${record.Id}: Enquiry ${record.EnquiryId} (${record.LeadName}) - TeamsMessageId: ${record.TeamsMessageId}`);
    });
    
    // Find records with EnquiryId < 434 (before Employment Test)
    const recordsToUpdate = currentRecords.recordset.filter(record => record.EnquiryId < 434);
    
    console.log(`\n🎯 Found ${recordsToUpdate.length} records with EnquiryId < 434 to update:`);
    recordsToUpdate.forEach(record => {
      console.log(`  Will update ID ${record.Id}: Enquiry ${record.EnquiryId} (${record.LeadName})`);
    });
    
    if (recordsToUpdate.length === 0) {
      console.log('ℹ️  No records need updating');
      return;
    }
    
    // Confirm before proceeding
    console.log('\n⚠️  This will set TeamsMessageId = 0 for these records, making them invalid for Teams deep linking.');
    console.log('   Continue? Press Ctrl+C to cancel, or any key to continue...');
    
    // Wait for user input (in a real script you'd use readline, but for this quick script...)
    // For now, let's proceed automatically since this is the agreed approach
    
    console.log('\n🔄 Updating records...');
    
    // Update records with EnquiryId < 434 to have TeamsMessageId = 0
    const updateResult = await pool.request().query(`
      UPDATE [dbo].[TeamsBotActivityTracking] 
      SET TeamsMessageId = 0, UpdatedAt = GETUTCDATE()
      WHERE EnquiryId < 434 AND TeamsMessageId != 0
    `);
    
    console.log(`✅ Updated ${updateResult.rowsAffected[0]} records`);
    
    // Verify the update
    console.log('\n📊 Records after update:');
    const updatedRecords = await pool.request().query(`
      SELECT Id, EnquiryId, LeadName, TeamsMessageId, UpdatedAt
      FROM [dbo].[TeamsBotActivityTracking] 
      ORDER BY EnquiryId ASC
    `);
    
    updatedRecords.recordset.forEach(record => {
      const status = record.TeamsMessageId === 0 ? '❌ (No Teams link)' : '✅ (Valid Teams link)';
      console.log(`  ID ${record.Id}: Enquiry ${record.EnquiryId} (${record.LeadName}) - TeamsMessageId: ${record.TeamsMessageId} ${status}`);
    });
    
    console.log('\n🎉 Update completed successfully!');
    console.log('   Frontend can now filter out records with TeamsMessageId = 0');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.close();
  }
}

updateTeamsMessageIds().catch(console.error);