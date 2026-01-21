import { config } from 'dotenv';
import sql from 'mssql';

config();

const search = process.argv[2] || 'alisha';

async function main() {
  // Search enquiries by email or name
  const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
  const result = await pool.request()
    .input('search', sql.VarChar, `%${search}%`)
    .query(`
      SELECT TOP 10 
        ID, First_Name, Last_Name, Email, Phone_Number, 
        Area_of_Work, pocname, Point_of_Contact, 
        Touchpoint_Date
      FROM enquiries 
      WHERE Email LIKE @search OR First_Name LIKE @search OR Last_Name LIKE @search
      ORDER BY ID DESC
    `);
  console.log('=== ENQUIRIES ===');
  console.log(JSON.stringify(result.recordset, null, 2));
  await pool.close();

  // Also check instructions DB
  const pool2 = await sql.connect(process.env.INSTRUCTIONS_SQL_CONNECTION_STRING);
  const result2 = await pool2.request()
    .input('search', sql.VarChar, `%${search}%`)
    .query(`
      SELECT TOP 10 
        InstructionRef, ProspectId, FirstName, LastName, Email, Stage
      FROM Instructions 
      WHERE Email LIKE @search OR FirstName LIKE @search OR LastName LIKE @search
      ORDER BY InstructionRef DESC
    `);
  console.log('\n=== INSTRUCTIONS ===');
  console.log(JSON.stringify(result2.recordset, null, 2));
  await pool2.close();
}

main().catch(e => console.error(e));
