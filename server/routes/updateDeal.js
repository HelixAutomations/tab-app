const sql = require('mssql');
const { withRequest } = require('../utils/db');

const getInstrConnStr = () => {
  const s = process.env.INSTRUCTIONS_SQL_CONNECTION_STRING;
  if (!s) throw new Error('INSTRUCTIONS_SQL_CONNECTION_STRING not configured');
  return s;
};

module.exports = async (req, res) => {
  const { dealId, ServiceDescription, Amount } = req.body;
  const requestId = Math.random().toString(36).substring(2, 10);
  
  if (!dealId || (!ServiceDescription && Amount === undefined)) {
    return res.status(400).json({ error: 'Deal ID and at least one field to update are required', requestId });
  }

  try {
    const updates = [];
    const inputs = [[('dealId'), sql.Int, parseInt(dealId)]];
    
    if (ServiceDescription !== undefined) {
      updates.push('ServiceDescription = @serviceDescription');
      inputs.push(['serviceDescription', sql.NVarChar, ServiceDescription]);
    }
    
    if (Amount !== undefined) {
      updates.push('Amount = @amount');
      inputs.push(['amount', sql.Decimal(18, 2), Amount]);
    }
    
    const updateQuery = `UPDATE Deals SET ${updates.join(', ')} WHERE DealId = @dealId`;
    
    const result = await withRequest(getInstrConnStr(), async (request) => {
      for (const [name, type, val] of inputs) request.input(name, type, val);
      return request.query(updateQuery);
    });
    
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