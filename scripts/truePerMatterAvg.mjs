import sql from 'mssql';

const config = {
  server: 'helix-database-server.database.windows.net',
  database: 'helix-core-data',
  user: 'helix-database-server',
  password: '3G3rt4Z5VuKHZbS',
  options: { encrypt: true, trustServerCertificate: false }
};

async function truePerMatterAvg() {
  await sql.connect(config);
  
  // True per-matter: sum fees by matter, then average
  const result = await sql.query`
    SELECT 
      COUNT(*) as matters_with_fees,
      SUM(matter_total) as total_fees,
      AVG(matter_total) as true_avg_per_matter
    FROM (
      SELECT matter_id, SUM(payment_allocated) as matter_total 
      FROM collectedTime 
      WHERE kind = 'Service'
      GROUP BY matter_id
    ) sub
  `;
  
  console.log('=== True Per-Matter Average (all time) ===');
  console.log('Matters with fees:', result.recordset[0].matters_with_fees);
  console.log('Total fees:', '£' + Math.round(result.recordset[0].total_fees).toLocaleString());
  console.log('True avg per matter:', '£' + Math.round(result.recordset[0].true_avg_per_matter).toLocaleString());
  
  // By trailing 12-month period (Dec 2023, Dec 2024, Dec 2025)
  console.log('\n=== True Avg by Period (trailing 12m matters) ===');
  
  // Dec 2023: matters opened Jan 2023 - Dec 2023
  const dec2023 = await sql.query`
    SELECT 
      COUNT(DISTINCT c.matter_id) as matters,
      SUM(c.payment_allocated) as total_fees,
      CASE WHEN COUNT(DISTINCT c.matter_id) > 0 
           THEN SUM(c.payment_allocated) / COUNT(DISTINCT c.matter_id) 
           ELSE 0 END as avg_per_matter
    FROM collectedTime c
    JOIN matters m ON CAST(c.matter_id AS VARCHAR) = CAST(m.[Unique ID] AS VARCHAR)
    WHERE c.kind = 'Service' 
      AND m.[Open Date] >= '2023-01-01' AND m.[Open Date] <= '2023-12-31'
  `;
  
  // Dec 2024: matters opened Jan 2024 - Dec 2024
  const dec2024 = await sql.query`
    SELECT 
      COUNT(DISTINCT c.matter_id) as matters,
      SUM(c.payment_allocated) as total_fees,
      CASE WHEN COUNT(DISTINCT c.matter_id) > 0 
           THEN SUM(c.payment_allocated) / COUNT(DISTINCT c.matter_id) 
           ELSE 0 END as avg_per_matter
    FROM collectedTime c
    JOIN matters m ON CAST(c.matter_id AS VARCHAR) = CAST(m.[Unique ID] AS VARCHAR)
    WHERE c.kind = 'Service' 
      AND m.[Open Date] >= '2024-01-01' AND m.[Open Date] <= '2024-12-31'
  `;
  
  // Dec 2025: matters opened Jan 2025 - Dec 2025
  const dec2025 = await sql.query`
    SELECT 
      COUNT(DISTINCT c.matter_id) as matters,
      SUM(c.payment_allocated) as total_fees,
      CASE WHEN COUNT(DISTINCT c.matter_id) > 0 
           THEN SUM(c.payment_allocated) / COUNT(DISTINCT c.matter_id) 
           ELSE 0 END as avg_per_matter
    FROM collectedTime c
    JOIN matters m ON CAST(c.matter_id AS VARCHAR) = CAST(m.[Unique ID] AS VARCHAR)
    WHERE c.kind = 'Service' 
      AND m.[Open Date] >= '2025-01-01' AND m.[Open Date] <= '2025-12-31'
  `;
  
  console.log('Period     | Matters | Total Fees     | Avg/Matter');
  console.log('-----------|---------|----------------|------------');
  console.log(`Dec 2023   | ${dec2023.recordset[0].matters.toString().padStart(7)} | £${Math.round(dec2023.recordset[0].total_fees).toLocaleString().padStart(13)} | £${Math.round(dec2023.recordset[0].avg_per_matter).toLocaleString()}`);
  console.log(`Dec 2024   | ${dec2024.recordset[0].matters.toString().padStart(7)} | £${Math.round(dec2024.recordset[0].total_fees).toLocaleString().padStart(13)} | £${Math.round(dec2024.recordset[0].avg_per_matter).toLocaleString()}`);
  console.log(`Dec 2025   | ${dec2025.recordset[0].matters.toString().padStart(7)} | £${Math.round(dec2025.recordset[0].total_fees).toLocaleString().padStart(13)} | £${Math.round(dec2025.recordset[0].avg_per_matter).toLocaleString()} (incomplete)`);
  
  await sql.close();
}

truePerMatterAvg();
