const sql = require('mssql');
const { withRequest } = require('./server/utils/db');

// Test the updated queries
async function testUpdatedQueries() {
  console.log('🧪 Testing Updated Database Queries...');
  
  const instructionsConnStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!instructionsConnStr) {
    console.log('❌ INSTRUCTIONS_SQL_CONNECTION_STRING not found in environment');
    return;
  }
  
  console.log('✅ Connection string found, testing updated queries...');
  
  try {
    await withRequest(instructionsConnStr, async (request, sqlClient) => {
      // Test updated deals query
      console.log('🔍 Testing updated Deals query...');
      const dealsResult = await request.query(`
        SELECT TOP 5 DealId, InstructionRef, ProspectId, ServiceDescription, Amount, AreaOfWork,
               PitchedBy, PitchedDate, PitchedTime, Status, IsMultiClient, LeadClientEmail,
               LeadClientId, CloseDate, CloseTime, PitchValidUntil
        FROM [dbo].[Deals] WITH (NOLOCK)
        ORDER BY PitchedDate DESC, DealId DESC
      `);
      console.log(`✅ Deals query: Retrieved ${dealsResult.recordset?.length || 0} records`);
      if (dealsResult.recordset?.length > 0) {
        console.log('📋 Sample deal result:', dealsResult.recordset[0]);
      }
      
      // Test updated instructions query
      console.log('🔍 Testing updated Instructions query...');
      const instructionsResult = await request.query(`
        SELECT TOP 5 InstructionRef, Stage, SubmissionDate, SubmissionTime, LastUpdated,
               MatterId, ClientId, Email, FirstName, LastName, Phone, InternalStatus
        FROM [dbo].[Instructions] WITH (NOLOCK)
        ORDER BY SubmissionDate DESC, InstructionRef DESC
      `);
      console.log(`✅ Instructions query: Retrieved ${instructionsResult.recordset?.length || 0} records`);
      if (instructionsResult.recordset?.length > 0) {
        console.log('📋 Sample instruction result:', instructionsResult.recordset[0]);
      }
      
      console.log('🎉 Both queries executed successfully!');
      console.log(`📊 Total: ${dealsResult.recordset?.length || 0} deals, ${instructionsResult.recordset?.length || 0} instructions`);
    });
    
  } catch (error) {
    console.error('❌ Query test failed:', error.message);
    console.error('🔍 Full error:', error);
  }
}

// Load environment variables
require('dotenv').config();

// Run the test
testUpdatedQueries().then(() => {
  console.log('✅ Query test completed');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Query test failed:', error);
  process.exit(1);
});