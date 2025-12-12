/**
 * Counsel Recommendations Routes
 * 
 * POST /api/counsel - Create new counsel recommendation
 * GET /api/counsel - Get all counsel (with optional filters)
 * GET /api/counsel/:id - Get single counsel by ID
 * PUT /api/counsel/:id - Update counsel
 * DELETE /api/counsel/:id - Archive counsel (soft delete)
 */

const express = require('express');
const sql = require('mssql');
const { withRequest } = require('../utils/db');

const router = express.Router();

// Connection string for helix_projects database
const getConnectionString = () => {
  const connStr = process.env.PROJECTS_SQL_CONNECTION_STRING || process.env.SQL_CONNECTION_STRING;
  if (!connStr) {
    throw new Error('Database connection string not configured');
  }
  return connStr;
};

/**
 * GET /api/counsel
 * Query counsel with optional filters
 * 
 * Query params:
 * - area_of_work: Filter by area (Commercial, Property, Construction, Employment)
 * - worktype: Filter by specific work type
 * - price_tier: Filter by price tier (cheap, mid, expensive)
 * - status: Filter by status (active, archived) - defaults to active
 * - search: Search by name or chambers
 */
router.get('/', async (req, res) => {
  try {
    const { area_of_work, worktype, price_tier, status = 'active', search } = req.query;

    const rows = await withRequest(getConnectionString(), async (request) => {
      let query = `
        SELECT 
          id,
          created_at,
          submitted_by,
          prefix,
          first_name,
          last_name,
          chambers_name,
          email,
          clerks_email,
          phone,
          website,
          area_of_work,
          worktype,
          introduced_by,
          source,
          notes,
          price_tier,
          status
        FROM counsel_recommendations
        WHERE 1=1
      `;

      if (status) {
        request.input('status', sql.NVarChar, status);
        query += ` AND status = @status`;
      }

      if (area_of_work) {
        request.input('area_of_work', sql.NVarChar, area_of_work);
        query += ` AND area_of_work = @area_of_work`;
      }

      if (worktype) {
        request.input('worktype', sql.NVarChar, worktype);
        query += ` AND worktype = @worktype`;
      }

      if (price_tier) {
        request.input('price_tier', sql.NVarChar, price_tier);
        query += ` AND price_tier = @price_tier`;
      }

      if (search) {
        request.input('search', sql.NVarChar, `%${search}%`);
        query += ` AND (first_name LIKE @search OR last_name LIKE @search OR chambers_name LIKE @search)`;
      }

      query += ` ORDER BY created_at DESC`;

      const result = await request.query(query);
      return result.recordset || [];
    }, 2);

    console.log(`[counsel] Found ${rows.length} counsel record(s)`);
    return res.json(rows);

  } catch (error) {
    console.error('[counsel] GET error:', error);
    return res.status(500).json({ error: 'Failed to fetch counsel', details: error.message });
  }
});

/**
 * GET /api/counsel/:id
 * Get single counsel by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const rows = await withRequest(getConnectionString(), async (request) => {
      const result = await request
        .input('id', sql.Int, parseInt(id, 10))
        .query(`
          SELECT * FROM counsel_recommendations WHERE id = @id
        `);
      return result.recordset || [];
    }, 2);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Counsel not found' });
    }

    return res.json(rows[0]);

  } catch (error) {
    console.error('[counsel] GET by ID error:', error);
    return res.status(500).json({ error: 'Failed to fetch counsel', details: error.message });
  }
});

/**
 * POST /api/counsel
 * Create new counsel recommendation
 */
router.post('/', async (req, res) => {
  try {
    const {
      submitted_by,
      prefix,
      first_name,
      last_name,
      chambers_name,
      email,
      clerks_email,
      phone,
      website,
      area_of_work,
      worktype,
      introduced_by,
      source,
      notes,
      price_tier
    } = req.body;

    // Validate required fields
    if (!first_name || !last_name) {
      return res.status(400).json({ error: 'first_name and last_name are required' });
    }
    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }
    if (!area_of_work || !worktype) {
      return res.status(400).json({ error: 'area_of_work and worktype are required' });
    }
    if (!price_tier) {
      return res.status(400).json({ error: 'price_tier is required' });
    }

    const result = await withRequest(getConnectionString(), async (request) => {
      const insertResult = await request
        .input('submitted_by', sql.NVarChar, submitted_by || null)
        .input('prefix', sql.NVarChar, prefix || null)
        .input('first_name', sql.NVarChar, first_name)
        .input('last_name', sql.NVarChar, last_name)
        .input('chambers_name', sql.NVarChar, chambers_name || null)
        .input('email', sql.NVarChar, email)
        .input('clerks_email', sql.NVarChar, clerks_email || null)
        .input('phone', sql.NVarChar, phone || null)
        .input('website', sql.NVarChar, website || null)
        .input('area_of_work', sql.NVarChar, area_of_work)
        .input('worktype', sql.NVarChar, worktype)
        .input('introduced_by', sql.NVarChar, introduced_by || null)
        .input('source', sql.NVarChar, source || null)
        .input('notes', sql.NVarChar, notes || null)
        .input('price_tier', sql.NVarChar, price_tier)
        .query(`
          INSERT INTO counsel_recommendations (
            submitted_by, prefix, first_name, last_name, chambers_name,
            email, clerks_email, phone, website, area_of_work, worktype,
            introduced_by, source, notes, price_tier, status
          )
          OUTPUT INSERTED.id, INSERTED.created_at
          VALUES (
            @submitted_by, @prefix, @first_name, @last_name, @chambers_name,
            @email, @clerks_email, @phone, @website, @area_of_work, @worktype,
            @introduced_by, @source, @notes, @price_tier, 'active'
          )
        `);
      return insertResult.recordset?.[0];
    }, 2);

    console.log(`[counsel] Created counsel ID: ${result?.id}`);
    return res.status(201).json({
      success: true,
      id: result?.id,
      created_at: result?.created_at
    });

  } catch (error) {
    console.error('[counsel] POST error:', error);
    return res.status(500).json({ error: 'Failed to create counsel', details: error.message });
  }
});

/**
 * PUT /api/counsel/:id
 * Update counsel recommendation
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      prefix,
      first_name,
      last_name,
      chambers_name,
      email,
      clerks_email,
      phone,
      website,
      area_of_work,
      worktype,
      introduced_by,
      source,
      notes,
      price_tier,
      status
    } = req.body;

    await withRequest(getConnectionString(), async (request) => {
      await request
        .input('id', sql.Int, parseInt(id, 10))
        .input('prefix', sql.NVarChar, prefix || null)
        .input('first_name', sql.NVarChar, first_name)
        .input('last_name', sql.NVarChar, last_name)
        .input('chambers_name', sql.NVarChar, chambers_name || null)
        .input('email', sql.NVarChar, email)
        .input('clerks_email', sql.NVarChar, clerks_email || null)
        .input('phone', sql.NVarChar, phone || null)
        .input('website', sql.NVarChar, website || null)
        .input('area_of_work', sql.NVarChar, area_of_work)
        .input('worktype', sql.NVarChar, worktype)
        .input('introduced_by', sql.NVarChar, introduced_by || null)
        .input('source', sql.NVarChar, source || null)
        .input('notes', sql.NVarChar, notes || null)
        .input('price_tier', sql.NVarChar, price_tier)
        .input('status', sql.NVarChar, status || 'active')
        .query(`
          UPDATE counsel_recommendations
          SET 
            prefix = @prefix,
            first_name = @first_name,
            last_name = @last_name,
            chambers_name = @chambers_name,
            email = @email,
            clerks_email = @clerks_email,
            phone = @phone,
            website = @website,
            area_of_work = @area_of_work,
            worktype = @worktype,
            introduced_by = @introduced_by,
            source = @source,
            notes = @notes,
            price_tier = @price_tier,
            status = @status
          WHERE id = @id
        `);
    }, 2);

    console.log(`[counsel] Updated counsel ID: ${id}`);
    return res.json({ success: true, id: parseInt(id, 10) });

  } catch (error) {
    console.error('[counsel] PUT error:', error);
    return res.status(500).json({ error: 'Failed to update counsel', details: error.message });
  }
});

/**
 * DELETE /api/counsel/:id
 * Archive counsel (soft delete)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await withRequest(getConnectionString(), async (request) => {
      await request
        .input('id', sql.Int, parseInt(id, 10))
        .query(`
          UPDATE counsel_recommendations
          SET status = 'archived'
          WHERE id = @id
        `);
    }, 2);

    console.log(`[counsel] Archived counsel ID: ${id}`);
    return res.json({ success: true, archived: true });

  } catch (error) {
    console.error('[counsel] DELETE error:', error);
    return res.status(500).json({ error: 'Failed to archive counsel', details: error.message });
  }
});

/**
 * GET /api/counsel/export/csv
 * Export counsel as CSV
 */
router.get('/export/csv', async (req, res) => {
  try {
    const { area_of_work, price_tier, status = 'active' } = req.query;

    const rows = await withRequest(getConnectionString(), async (request) => {
      let query = `
        SELECT 
          first_name, last_name, prefix, chambers_name,
          email, clerks_email, phone, website, area_of_work, worktype,
          introduced_by, source, notes, price_tier, created_at
        FROM counsel_recommendations
        WHERE status = @status
      `;
      request.input('status', sql.NVarChar, status);

      if (area_of_work) {
        request.input('area_of_work', sql.NVarChar, area_of_work);
        query += ` AND area_of_work = @area_of_work`;
      }

      if (price_tier) {
        request.input('price_tier', sql.NVarChar, price_tier);
        query += ` AND price_tier = @price_tier`;
      }

      query += ` ORDER BY area_of_work, last_name, first_name`;

      const result = await request.query(query);
      return result.recordset || [];
    }, 2);

    // Build CSV
    const headers = [
      'First Name', 'Last Name', 'Prefix', 'Chambers',
      'Email', 'Clerks Email', 'Phone', 'Website', 'Area of Work', 'Work Type',
      'Introduced By', 'Source', 'Notes', 'Price Tier', 'Created At'
    ];
    
    const csvRows = [headers.join(',')];
    for (const row of rows) {
      const values = [
        row.first_name, row.last_name, row.prefix, row.chambers_name,
        row.email, row.clerks_email, row.phone, row.website, row.area_of_work, row.worktype,
        row.introduced_by, row.source, row.notes, row.price_tier, row.created_at
      ].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`);
      csvRows.push(values.join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="counsel_${area_of_work || 'all'}_${new Date().toISOString().split('T')[0]}.csv"`);
    return res.send(csvRows.join('\n'));

  } catch (error) {
    console.error('[counsel] CSV export error:', error);
    return res.status(500).json({ error: 'Failed to export counsel', details: error.message });
  }
});

module.exports = router;
