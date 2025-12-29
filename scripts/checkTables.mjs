// Check if expert and counsel tables exist
import sql from 'mssql';
import dotenv from 'dotenv';
dotenv.config();

const connStr = process.env.PROJECTS_SQL_CONNECTION_STRING || process.env.SQL_CONNECTION_STRING;

async function run() {
  try {
    const pool = await sql.connect(connStr);
    
    // Check tables
    const tables = await pool.request().query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME IN ('expert_recommendations', 'counsel_recommendations')
    `);
    console.log('Existing tables:', tables.recordset.map(r => r.TABLE_NAME));
    
    if (tables.recordset.length === 0) {
      console.log('\n⚠️  Tables do not exist. Creating them now...\n');
      
      // Create expert_recommendations table
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'expert_recommendations')
        BEGIN
          CREATE TABLE expert_recommendations (
            id INT IDENTITY(1,1) PRIMARY KEY,
            created_at DATETIME2 DEFAULT GETUTCDATE(),
            submitted_by NVARCHAR(10),
            prefix NVARCHAR(20),
            first_name NVARCHAR(100) NOT NULL,
            last_name NVARCHAR(100) NOT NULL,
            company_name NVARCHAR(200),
            company_number NVARCHAR(20),
            email NVARCHAR(200),
            phone NVARCHAR(50),
            website NVARCHAR(500),
            cv_url NVARCHAR(500),
            area_of_work NVARCHAR(50) NOT NULL,
            worktype NVARCHAR(100) NOT NULL,
            introduced_by NVARCHAR(200),
            source NVARCHAR(50),
            notes NVARCHAR(MAX),
            status NVARCHAR(20) DEFAULT 'active'
          )
        END
      `);
      console.log('✅ Created expert_recommendations table');
      
      // Create indexes for expert table
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_expert_recommendations_area')
          CREATE INDEX IX_expert_recommendations_area ON expert_recommendations(area_of_work);
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_expert_recommendations_worktype')
          CREATE INDEX IX_expert_recommendations_worktype ON expert_recommendations(worktype);
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_expert_recommendations_status')
          CREATE INDEX IX_expert_recommendations_status ON expert_recommendations(status);
      `);
      console.log('✅ Created expert_recommendations indexes');
      
      // Create counsel_recommendations table
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'counsel_recommendations')
        BEGIN
          CREATE TABLE counsel_recommendations (
            id INT IDENTITY(1,1) PRIMARY KEY,
            created_at DATETIME2 DEFAULT GETUTCDATE(),
            submitted_by NVARCHAR(10),
            prefix NVARCHAR(20),
            first_name NVARCHAR(100) NOT NULL,
            last_name NVARCHAR(100) NOT NULL,
            chambers_name NVARCHAR(200),
            email NVARCHAR(200) NOT NULL,
            clerks_email NVARCHAR(200),
            phone NVARCHAR(50),
            website NVARCHAR(500),
            area_of_work NVARCHAR(50) NOT NULL,
            worktype NVARCHAR(100) NOT NULL,
            introduced_by NVARCHAR(200),
            source NVARCHAR(50),
            notes NVARCHAR(MAX),
            price_tier NVARCHAR(20) NOT NULL,
            status NVARCHAR(20) DEFAULT 'active'
          )
        END
      `);
      console.log('✅ Created counsel_recommendations table');
      
      // Create indexes for counsel table
      await pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_counsel_recommendations_area')
          CREATE INDEX IX_counsel_recommendations_area ON counsel_recommendations(area_of_work);
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_counsel_recommendations_worktype')
          CREATE INDEX IX_counsel_recommendations_worktype ON counsel_recommendations(worktype);
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_counsel_recommendations_price')
          CREATE INDEX IX_counsel_recommendations_price ON counsel_recommendations(price_tier);
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_counsel_recommendations_status')
          CREATE INDEX IX_counsel_recommendations_status ON counsel_recommendations(status);
      `);
      console.log('✅ Created counsel_recommendations indexes');
      
      console.log('\n✅ All tables created successfully!\n');
    } else {
      console.log('\n✅ Tables already exist\n');
    }
    
    // Verify final state
    const finalCheck = await pool.request().query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME IN ('expert_recommendations', 'counsel_recommendations')
    `);
    console.log('Final table check:', finalCheck.recordset.map(r => r.TABLE_NAME));
    
    await pool.close();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

run();
