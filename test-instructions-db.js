const sql = require('mssql');
const { withRequest } = require('./server/utils/db');

// Test the instructions database connection
async function testInstructionsDB() {
  console.log('🧪 Testing Instructions Database Connection...');
  
  const instructionsConnStr = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!instructionsConnStr) {
    console.log('❌ INSTRUCTIONS_SQL_CONNECTION_STRING not found in environment');
    return;
  }
  
  console.log('✅ Connection string found, testing connection...');
  
  try {
    const result = await withRequest(instructionsConnStr, async (request, sqlClient) => {
      // First, list all tables in the database
      console.log('🔍 Listing all tables in the database...');
      const tablesResult = await request.query(`
        SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_SCHEMA, TABLE_NAME
      `);
      console.log(`📋 Available tables:`, tablesResult.recordset);
      
      // Check if Deals table exists and get its schema
      console.log('🔍 Checking Deals table schema...');
      const dealsSchemaResult = await request.query(`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Deals'
        ORDER BY ORDINAL_POSITION
      `);
      console.log(`📋 Deals table columns:`, dealsSchemaResult.recordset);
      
      // Get sample data from Deals
      if (dealsSchemaResult.recordset?.length > 0) {
        console.log('🔍 Testing Deals table data...');
        const dealsResult = await request.query(`
          SELECT TOP 3 * 
          FROM [dbo].[Deals] WITH (NOLOCK)
        `);
        console.log(`✅ Deals table: Found ${dealsResult.recordset?.length || 0} records`);
        if (dealsResult.recordset?.length > 0) {
          console.log('📋 Sample deal:', dealsResult.recordset[0]);
        }
      }
      
      // Check if Instructions table exists and get its schema
      console.log('🔍 Checking Instructions table schema...');
      const instructionsSchemaResult = await request.query(`
        SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'Instructions'
        ORDER BY ORDINAL_POSITION
      `);
      console.log(`📋 Instructions table columns:`, instructionsSchemaResult.recordset);
      
      // Get sample data from Instructions
      if (instructionsSchemaResult.recordset?.length > 0) {
        console.log('🔍 Testing Instructions table data...');
        const instructionsResult = await request.query(`
          SELECT TOP 3 * 
          FROM [dbo].[Instructions] WITH (NOLOCK)
        `);
        console.log(`✅ Instructions table: Found ${instructionsResult.recordset?.length || 0} records`);
        if (instructionsResult.recordset?.length > 0) {
          console.log('📋 Sample instruction:', instructionsResult.recordset[0]);
        }
      }
      
      return {
        tables: tablesResult.recordset?.length || 0,
        dealsColumns: dealsSchemaResult.recordset?.length || 0,
        instructionsColumns: instructionsSchemaResult.recordset?.length || 0
      };
    });
    
    console.log('🎉 Database test completed successfully!');
    console.log('📊 Total counts:', result);
    
  } catch (error) {
    console.error('❌ Database test failed:', error.message);
    console.error('🔍 Full error:', error);
  }
}

// Load environment variables
require('dotenv').config();

// Run the test
testInstructionsDB().then(() => {
  console.log('✅ Test script completed');
  process.exit(0);
}).catch((error) => {
  console.error('💥 Test script failed:', error);
  process.exit(1);
});