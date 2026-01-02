const sql = require('mssql');

const config = {
  server: 'helix-instructions.database.windows.net',
  database: 'instructions',
  user: 'instructionsadmin',
  password: process.env.SQL_PASSWORD_INSTRUCTIONS,
  options: { encrypt: true, trustServerCertificate: false }
};

(async () => {
  try {
    await sql.connect(config);
    
    console.log('=== CHECKING TRIAGE DEALS ===');
    const deals = await sql.query(`SELECT TOP 10 PitchedBy, EnquiryEmail, CreatedAt 
                                   FROM Deals 
                                   WHERE PitchedBy = 'triage' 
                                   ORDER BY CreatedAt DESC`);
    console.log('Recent triage deals:');
    deals.recordset.forEach(d => {
      console.log(`  ${d.EnquiryEmail} - ${d.CreatedAt}`);
    });
    
    console.log('\n=== CHECKING ALL PITCHEDBY VALUES ===');
    const allPitched = await sql.query(`SELECT DISTINCT PitchedBy, COUNT(*) as cnt 
                                        FROM Deals 
                                        WHERE PitchedBy IS NOT NULL 
                                        GROUP BY PitchedBy 
                                        ORDER BY cnt DESC`);
    console.log('All PitchedBy values:', allPitched.recordset);
    
    console.log('\n=== CHECKING RECENT ENQUIRY EMAILS ===');
    const emails = await sql.query(`SELECT TOP 10 [From], [Subject], [Date] 
                                    FROM Enquiries 
                                    WHERE [Date] >= DATEADD(day, -30, GETDATE()) 
                                    ORDER BY [Date] DESC`);
    console.log('Recent enquiries:');
    emails.recordset.forEach(e => {
      console.log(`  ${e.From} - ${e.Subject}`);
    });
    
    // Check if any triage emails match enquiry emails
    console.log('\n=== CHECKING EMAIL OVERLAP ===');
    const overlap = await sql.query(`SELECT DISTINCT d.EnquiryEmail 
                                     FROM Deals d 
                                     INNER JOIN Enquiries e ON d.EnquiryEmail = e.[From]
                                     WHERE d.PitchedBy = 'triage'
                                     AND e.[Date] >= DATEADD(day, -30, GETDATE())`);
    console.log('Triage emails that match recent enquiries:', overlap.recordset);
    
    await sql.close();
  } catch (error) {
    console.error('Error:', error);
  }
})();