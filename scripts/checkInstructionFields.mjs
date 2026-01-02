// Quick debug script to check what fields are in instruction data
import sql from 'mssql';
import dotenv from 'dotenv';
dotenv.config();

const config = {
  server: 'instructions.database.windows.net',
  database: 'instructions',
  user: process.env.DB_USER || process.env.INSTRUCTIONS_DB_USER,
  password: process.env.DB_PASSWORD || process.env.INSTRUCTIONS_DB_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: false
  }
};

async function main() {
  try {
    await sql.connect(config);
    
    // Get a sample instruction with all columns
    const result = await sql.query`
      SELECT TOP 1 *
      FROM Instructions
      WHERE FirstName IS NOT NULL OR LastName IS NOT NULL
      ORDER BY LastUpdated DESC
    `;
    
    if (result.recordset.length > 0) {
      const inst = result.recordset[0];
      console.log('\n=== Sample Instruction with identity data ===');
      console.log('InstructionRef:', inst.InstructionRef);
      console.log('FirstName:', inst.FirstName);
      console.log('LastName:', inst.LastName);
      console.log('Email:', inst.Email);
      console.log('ClientEmail:', inst.ClientEmail);
      console.log('Phone:', inst.Phone);
      console.log('ClientType:', inst.ClientType);
      console.log('CompanyName:', inst.CompanyName);
      console.log('City:', inst.City);
      console.log('Postcode:', inst.Postcode);
      console.log('\n=== All columns in this record ===');
      console.log(Object.keys(inst).join(', '));
    } else {
      console.log('No instructions with FirstName/LastName found');
      
      // Check if ANY instructions exist
      const countResult = await sql.query`SELECT COUNT(*) as cnt FROM Instructions`;
      console.log('Total instructions:', countResult.recordset[0].cnt);
      
      // Get any instruction to see structure
      const anyResult = await sql.query`SELECT TOP 1 * FROM Instructions ORDER BY LastUpdated DESC`;
      if (anyResult.recordset.length > 0) {
        console.log('\n=== Columns available ===');
        console.log(Object.keys(anyResult.recordset[0]).join(', '));
      }
    }
    
    await sql.close();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
