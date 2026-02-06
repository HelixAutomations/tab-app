require('dotenv').config();
const sql = require('mssql');

const connectionString =
  process.env.INSTRUCTIONS_SQL_CONNECTION_STRING || process.env.SQL_CONNECTION_STRING;

if (!connectionString) {
  console.error(
    'Missing connection string. Set INSTRUCTIONS_SQL_CONNECTION_STRING (preferred) or SQL_CONNECTION_STRING in your environment.'
  );
  process.exit(1);
}

(async () => {
  let pool;
  try {
    pool = await sql.connect(connectionString);

    console.log('=== CHECKING TRIAGE DEALS ===');
    const deals = await pool.request().query(`
      SELECT TOP 10 PitchedBy, EnquiryEmail, CreatedAt
      FROM Deals
      WHERE PitchedBy = 'triage'
      ORDER BY CreatedAt DESC
    `);
    console.log('Recent triage deals:');
    deals.recordset.forEach((d) => {
      console.log(`  ${d.EnquiryEmail} - ${d.CreatedAt}`);
    });

    console.log('\n=== CHECKING ALL PITCHEDBY VALUES ===');
    const allPitched = await pool.request().query(`
      SELECT DISTINCT PitchedBy, COUNT(*) as cnt
      FROM Deals
      WHERE PitchedBy IS NOT NULL
      GROUP BY PitchedBy
      ORDER BY cnt DESC
    `);
    console.log('All PitchedBy values:', allPitched.recordset);

    console.log('\n=== CHECKING RECENT ENQUIRY EMAILS ===');
    const emails = await pool.request().query(`
      SELECT TOP 10 [From], [Subject], [Date]
      FROM Enquiries
      WHERE [Date] >= DATEADD(day, -30, GETDATE())
      ORDER BY [Date] DESC
    `);
    console.log('Recent enquiries:');
    emails.recordset.forEach((e) => {
      console.log(`  ${e.From} - ${e.Subject}`);
    });

    console.log('\n=== CHECKING EMAIL OVERLAP ===');
    const overlap = await pool.request().query(`
      SELECT DISTINCT d.EnquiryEmail
      FROM Deals d
      INNER JOIN Enquiries e ON d.EnquiryEmail = e.[From]
      WHERE d.PitchedBy = 'triage'
        AND e.[Date] >= DATEADD(day, -30, GETDATE())
    `);
    console.log('Triage emails that match recent enquiries:', overlap.recordset);
  } catch (error) {
    console.error('Error:', error);
    process.exitCode = 1;
  } finally {
    if (pool) await pool.close();
  }
})();
