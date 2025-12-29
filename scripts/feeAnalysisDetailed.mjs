import sql from 'mssql';

const config = {
  server: 'helix-database-server.database.windows.net',
  database: 'helix-core-data',
  user: 'helix-database-server',
  password: '3G3rt4Z5VuKHZbS',
  options: { encrypt: true, trustServerCertificate: false }
};

async function detailedAnalysis() {
  await sql.connect(config);
  
  // 1. Monthly rolling trend (for charting)
  console.log('=== Monthly Rolling 12m Avg (for charting) ===\n');
  
  const monthlyMatters = await sql.query`
    SELECT FORMAT(CAST([Open Date] AS DATE), 'yyyy-MM') as month, COUNT(*) as cnt
    FROM matters WHERE [Open Date] >= '2022-01-01'
    GROUP BY FORMAT(CAST([Open Date] AS DATE), 'yyyy-MM')
  `;
  const monthlyFees = await sql.query`
    SELECT FORMAT(CAST(payment_date AS DATE), 'yyyy-MM') as month, SUM(payment_allocated) as total
    FROM collectedTime WHERE payment_date >= '2022-01-01' AND kind = 'Service'
    GROUP BY FORMAT(CAST(payment_date AS DATE), 'yyyy-MM')
  `;
  
  const mattersMap = new Map(monthlyMatters.recordset.map(r => [r.month, r.cnt]));
  const feesMap = new Map(monthlyFees.recordset.map(r => [r.month, r.total]));
  
  const months = [];
  let d = new Date('2022-01-01');
  while (d <= new Date()) {
    months.push(d.toISOString().slice(0,7));
    d.setMonth(d.getMonth() + 1);
  }
  
  console.log('Month,Matters_12m,Fees_12m,Avg_Fee');
  for (let i = 11; i < months.length; i++) {
    const trailing = months.slice(i-11, i+1);
    let matters = 0, fees = 0;
    trailing.forEach(m => {
      matters += mattersMap.get(m) || 0;
      fees += feesMap.get(m) || 0;
    });
    const avg = matters > 0 ? Math.round(fees / matters) : 0;
    if (fees > 0) console.log(`${months[i]},${matters},${Math.round(fees)},${avg}`);
  }
  
  // 2. By Practice Area
  console.log('\n\n=== By Practice Area (2024 matters, fees collected to date) ===\n');
  const byArea = await sql.query`
    SELECT 
      m.[Practice Area] as area,
      COUNT(DISTINCT c.matter_id) as matters,
      SUM(c.payment_allocated) as total_fees,
      SUM(c.payment_allocated) / COUNT(DISTINCT c.matter_id) as avg_fee
    FROM collectedTime c
    JOIN matters m ON CAST(c.matter_id AS VARCHAR) = CAST(m.[Unique ID] AS VARCHAR)
    WHERE c.kind = 'Service' 
      AND m.[Open Date] >= '2024-01-01' AND m.[Open Date] <= '2024-12-31'
    GROUP BY m.[Practice Area]
    ORDER BY avg_fee DESC
  `;
  
  console.log('Practice Area                    | Matters | Avg Fee');
  console.log('---------------------------------|---------|--------');
  byArea.recordset.forEach(r => {
    const area = (r.area || 'Unknown').substring(0, 32).padEnd(32);
    console.log(`${area} | ${r.matters.toString().padStart(7)} | £${Math.round(r.avg_fee).toLocaleString()}`);
  });
  
  // 3. Matter volume trend
  console.log('\n\n=== Matter Volume by Year ===\n');
  const volumeByYear = await sql.query`
    SELECT YEAR([Open Date]) as yr, COUNT(*) as matters
    FROM matters 
    WHERE [Open Date] >= '2019-01-01'
    GROUP BY YEAR([Open Date])
    ORDER BY yr
  `;
  console.log('Year | Matters Opened');
  volumeByYear.recordset.forEach(r => {
    console.log(`${r.yr} | ${r.matters}`);
  });
  
  // 4. Top 10 highest value matters (2024) to see what's driving averages
  console.log('\n\n=== Top 10 Highest Fee Matters (opened 2024) ===\n');
  const topMatters = await sql.query`
    SELECT TOP 10
      m.[Display Number] as matter,
      m.[Practice Area] as area,
      SUM(c.payment_allocated) as total_fees
    FROM collectedTime c
    JOIN matters m ON CAST(c.matter_id AS VARCHAR) = CAST(m.[Unique ID] AS VARCHAR)
    WHERE c.kind = 'Service' 
      AND m.[Open Date] >= '2024-01-01' AND m.[Open Date] <= '2024-12-31'
    GROUP BY m.[Display Number], m.[Practice Area]
    ORDER BY total_fees DESC
  `;
  console.log('Matter          | Practice Area                    | Total Fees');
  topMatters.recordset.forEach(r => {
    const matter = (r.matter || '').substring(0, 14).padEnd(14);
    const area = (r.area || '').substring(0, 32).padEnd(32);
    console.log(`${matter} | ${area} | £${Math.round(r.total_fees).toLocaleString()}`);
  });
  
  // 5. Fee distribution (percentiles)
  console.log('\n\n=== Fee Distribution (2024 matters) ===\n');
  const distribution = await sql.query`
    WITH MatterTotals AS (
      SELECT c.matter_id, SUM(c.payment_allocated) as total
      FROM collectedTime c
      JOIN matters m ON CAST(c.matter_id AS VARCHAR) = CAST(m.[Unique ID] AS VARCHAR)
      WHERE c.kind = 'Service' 
        AND m.[Open Date] >= '2024-01-01' AND m.[Open Date] <= '2024-12-31'
      GROUP BY c.matter_id
    )
    SELECT 
      MIN(total) as min_fee,
      MAX(total) as max_fee,
      AVG(total) as mean_fee,
      COUNT(*) as matter_count
    FROM MatterTotals
  `;
  const d1 = distribution.recordset[0];
  console.log(`Matters: ${d1.matter_count}`);
  console.log(`Min: £${Math.round(d1.min_fee).toLocaleString()}`);
  console.log(`Max: £${Math.round(d1.max_fee).toLocaleString()}`);
  console.log(`Mean: £${Math.round(d1.mean_fee).toLocaleString()}`);
  
  await sql.close();
}

detailedAnalysis();
