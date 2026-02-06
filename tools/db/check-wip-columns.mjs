import { config } from 'dotenv';
import sql from 'mssql';

config();

const query = "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='wip' ORDER BY ORDINAL_POSITION";

try {
  const pool = await sql.connect(process.env.SQL_CONNECTION_STRING);
  const result = await pool.request().query(query);
  console.log(JSON.stringify(result.recordset, null, 2));
  await pool.close();
} catch (error) {
  console.error(error);
  process.exit(1);
}
