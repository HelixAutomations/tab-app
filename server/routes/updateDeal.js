const sql = require('mssql');

// Database connection configuration
let dbConfig = null;

async function getDbConfig() {
  if (dbConfig) return dbConfig;
  
  const connectionString = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not found in environment');
  }
  
  const params = new URLSearchParams(connectionString.split(';').join('&'));
  const server = params.get('Server').replace('tcp:', '').split(',')[0];
  const database = params.get('Initial Catalog');
  const user = params.get('User ID');
  const password = params.get('Password');
  
  dbConfig = {
    server,
    database, 
    user,
    password,
    options: {
      encrypt: true,
      trustServerCertificate: false,
      connectTimeout: 30000,
      requestTimeout: 30000
    }
  };
  
  return dbConfig;
}

module.exports = async (req, res) => {
  const { dealId, ServiceDescription, Amount } = req.body;
  const requestId = Math.random().toString(36).substring(2, 10);
  
  if (!dealId || (!ServiceDescription && Amount === undefined)) {
    return res.status(400).json({ error: 'Deal ID and at least one field to update are required', requestId });
  }

  try {
    const config = await getDbConfig();
    const pool = await sql.connect(config);
    
    const updates = [];
    const request = pool.request().input('dealId', sql.Int, parseInt(dealId));
    
    if (ServiceDescription !== undefined) {
      updates.push('ServiceDescription = @serviceDescription');
      request.input('serviceDescription', sql.NVarChar, ServiceDescription);
    }
    
    if (Amount !== undefined) {
      updates.push('Amount = @amount');
      request.input('amount', sql.Decimal(18, 2), Amount);
    }
    
    const updateQuery = `UPDATE Deals SET ${updates.join(', ')} WHERE DealId = @dealId`;
    const result = await request.query(updateQuery);
    
    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ error: 'Deal not found', requestId });
    }

    res.json({
      success: true,
      dealId: parseInt(dealId),
      updates: { ServiceDescription, Amount },
      requestId
    });
    
  } catch (error) {
    console.error(`[updateDeal] Error updating deal ${dealId}:`, error.message);
    res.status(500).json({ error: 'Failed to update deal', details: error.message, requestId });
  }
};