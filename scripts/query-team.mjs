import sql from 'mssql';

async function auditTeam() {
  const cs = process.env.SQL_CONNECTION_STRING;
  if (!cs) {
    console.log('❌ SQL_CONNECTION_STRING not set');
    return;
  }

  try {
    const pool = await sql.connect(cs);
    const result = await pool.request()
      .query(`
        SELECT Initials, [Full Name], Email, Role 
        FROM dbo.team 
        WHERE Initials IN ('AT', 'BOD', 'CB', 'PG', 'ZK') 
        ORDER BY Initials
      `);
    
    console.log('\n=== TEAM DATABASE TRUTH ===\n');
    result.recordset.forEach(r => {
      console.log(`${r.Initials.padEnd(5)} → ${r['Full Name'].padEnd(20)} (${r.Role}) ${r.Email}`);
    });

    await pool.close();
  } catch (err) {
    console.log('Error:', err.message);
  }
}

auditTeam();
