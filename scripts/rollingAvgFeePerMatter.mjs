/**
 * Rolling 12-Month Average Fee Per Matter Analysis
 * 
 * Formula: Rolling Avg = (Fees collected in trailing 12 months) / (Matters opened in trailing 12 months)
 * 
 * Outputs monthly data points showing how average fee per matter has evolved over time.
 */

import sql from 'mssql';

const config = {
  server: 'helix-database-server.database.windows.net',
  database: 'helix-core-data',
  user: 'helix-database-server',
  password: '3G3rt4Z5VuKHZbS',
  options: { encrypt: true, trustServerCertificate: false }
};

async function analyzeRollingAvgFee() {
  try {
    await sql.connect(config);
    console.log('Connected to database\n');

    // Get matters opened by month
    console.log('=== Matters opened by month ===\n');
    const mattersOpened = await sql.query`
      SELECT 
        FORMAT(CAST([Open Date] AS DATE), 'yyyy-MM') as month,
        COUNT(*) as matters_opened
      FROM matters
      WHERE [Open Date] IS NOT NULL
        AND [Open Date] >= '2019-01-01'
      GROUP BY FORMAT(CAST([Open Date] AS DATE), 'yyyy-MM')
      ORDER BY month
    `;

    // Get fees collected by month
    console.log('=== Fees collected by month ===\n');
    const feesCollected = await sql.query`
      SELECT 
        FORMAT(CAST(payment_date AS DATE), 'yyyy-MM') as month,
        SUM(payment_allocated) as fees_collected
      FROM collectedTime
      WHERE payment_date IS NOT NULL
        AND payment_date >= '2019-01-01'
      GROUP BY FORMAT(CAST(payment_date AS DATE), 'yyyy-MM')
      ORDER BY month
    `;

    // Build lookup maps
    const mattersMap = new Map();
    mattersOpened.recordset.forEach(r => mattersMap.set(r.month, r.matters_opened));

    const feesMap = new Map();
    feesCollected.recordset.forEach(r => feesMap.set(r.month, r.fees_collected));

    // Get all months from 2019 to now
    const allMonths = [];
    const startDate = new Date('2019-01-01');
    const endDate = new Date();
    let current = new Date(startDate);
    while (current <= endDate) {
      const monthStr = current.toISOString().slice(0, 7);
      allMonths.push(monthStr);
      current.setMonth(current.getMonth() + 1);
    }

    // Calculate rolling 12-month averages
    console.log('=== Rolling 12-Month Average Fee Per Matter ===\n');
    console.log('Month        | 12m Matters | 12m Fees (£)   | Avg Fee/Matter');
    console.log('-------------|-------------|----------------|----------------');

    const results = [];
    
    for (let i = 11; i < allMonths.length; i++) {
      // Get trailing 12 months (including current month)
      const trailingMonths = allMonths.slice(i - 11, i + 1);
      
      let totalMatters = 0;
      let totalFees = 0;
      
      trailingMonths.forEach(month => {
        totalMatters += mattersMap.get(month) || 0;
        totalFees += feesMap.get(month) || 0;
      });
      
      const avgFee = totalMatters > 0 ? totalFees / totalMatters : 0;
      const currentMonth = allMonths[i];
      
      results.push({
        month: currentMonth,
        matters: totalMatters,
        fees: totalFees,
        avgFee: avgFee
      });
      
      console.log(
        `${currentMonth}     | ${String(totalMatters).padStart(11)} | ${('£' + totalFees.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })).padStart(14)} | £${avgFee.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
      );
    }

    // Summary
    console.log('\n=== Summary ===');
    
    // Find first month with meaningful fee data (fees > £1m as that indicates full year of data)
    const firstMeaningful = results.find(r => r.fees > 1000000);
    const lastResult = results[results.length - 1];
    
    if (firstMeaningful) {
      console.log(`\n${firstMeaningful.month}: £${firstMeaningful.avgFee.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} avg fee/matter (first full 12m of fee data)`);
    }
    console.log(`${lastResult.month}: £${lastResult.avgFee.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} avg fee/matter (latest)`);
    
    if (firstMeaningful && lastResult.avgFee > 0 && firstMeaningful.avgFee > 0) {
      const change = ((lastResult.avgFee - firstMeaningful.avgFee) / firstMeaningful.avgFee * 100).toFixed(1);
      console.log(`\nChange since ${firstMeaningful.month}: +${change}%`);
    }
    
    // Year-on-year comparison
    console.log('\n=== Year-on-Year Comparison ===');
    const dec2023 = results.find(r => r.month === '2023-12');
    const dec2024 = results.find(r => r.month === '2024-12');
    const dec2025 = results.find(r => r.month === '2025-12');
    
    if (dec2023) console.log(`Dec 2023: £${dec2023.avgFee.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} avg fee/matter`);
    if (dec2024) console.log(`Dec 2024: £${dec2024.avgFee.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} avg fee/matter`);
    if (dec2025) console.log(`Dec 2025: £${dec2025.avgFee.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} avg fee/matter`);
    
    if (dec2024 && dec2025) {
      const yoyChange = ((dec2025.avgFee - dec2024.avgFee) / dec2024.avgFee * 100).toFixed(1);
      console.log(`\nYoY change (Dec 24 → Dec 25): +${yoyChange}%`);
    }

    await sql.close();
  } catch (err) {
    console.error('Error:', err.message);
  }
}

analyzeRollingAvgFee();
