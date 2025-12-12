/**
 * Expert Recommendations Routes
 * 
 * POST /api/experts - Create new expert recommendation
 * GET /api/experts - Get all experts (with optional filters)
 * GET /api/experts/:id - Get single expert by ID
 * PUT /api/experts/:id - Update expert
 * DELETE /api/experts/:id - Archive expert (soft delete)
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
 * GET /api/experts
 * Query experts with optional filters
 * 
 * Query params:
 * - area_of_work: Filter by area (Commercial, Property, Construction, Employment)
 * - worktype: Filter by specific work type
 * - status: Filter by status (active, archived) - defaults to active
 * - search: Search by name or company
 */
router.get('/', async (req, res) => {
  try {
    const { area_of_work, worktype, status = 'active', search } = req.query;

    const rows = await withRequest(getConnectionString(), async (request) => {
      let query = `
        SELECT 
          id,
          created_at,
          submitted_by,
          prefix,
          first_name,
          last_name,
          company_name,
          company_number,
          email,
          phone,
          website,
          cv_url,
          area_of_work,
          worktype,
          introduced_by,
          source,
          notes,
          status
        FROM expert_recommendations
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

      if (search) {
        request.input('search', sql.NVarChar, `%${search}%`);
        query += ` AND (first_name LIKE @search OR last_name LIKE @search OR company_name LIKE @search)`;
      }

      query += ` ORDER BY created_at DESC`;

      const result = await request.query(query);
      return result.recordset || [];
    }, 2);

    console.log(`[experts] Found ${rows.length} expert(s)`);
    return res.json(rows);

  } catch (error) {
    console.error('[experts] GET error:', error);
    return res.status(500).json({ error: 'Failed to fetch experts', details: error.message });
  }
});

/**
 * GET /api/experts/:id
 * Get single expert by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const rows = await withRequest(getConnectionString(), async (request) => {
      const result = await request
        .input('id', sql.Int, parseInt(id, 10))
        .query(`
          SELECT * FROM expert_recommendations WHERE id = @id
        `);
      return result.recordset || [];
    }, 2);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Expert not found' });
    }

    return res.json(rows[0]);

  } catch (error) {
    console.error('[experts] GET by ID error:', error);
    return res.status(500).json({ error: 'Failed to fetch expert', details: error.message });
  }
});

/**
 * POST /api/experts
 * Create new expert recommendation
 */
router.post('/', async (req, res) => {
  try {
    const {
      submitted_by,
      prefix,
      first_name,
      last_name,
      company_name,
      company_number,
      email,
      phone,
      website,
      cv_url,
      area_of_work,
      worktype,
      introduced_by,
      source,
      notes
    } = req.body;

    // Validate required fields
    if (!first_name || !last_name) {
      return res.status(400).json({ error: 'first_name and last_name are required' });
    }
    if (!area_of_work || !worktype) {
      return res.status(400).json({ error: 'area_of_work and worktype are required' });
    }

    const result = await withRequest(getConnectionString(), async (request) => {
      const insertResult = await request
        .input('submitted_by', sql.NVarChar, submitted_by || null)
        .input('prefix', sql.NVarChar, prefix || null)
        .input('first_name', sql.NVarChar, first_name)
        .input('last_name', sql.NVarChar, last_name)
        .input('company_name', sql.NVarChar, company_name || null)
        .input('company_number', sql.NVarChar, company_number || null)
        .input('email', sql.NVarChar, email || null)
        .input('phone', sql.NVarChar, phone || null)
        .input('website', sql.NVarChar, website || null)
        .input('cv_url', sql.NVarChar, cv_url || null)
        .input('area_of_work', sql.NVarChar, area_of_work)
        .input('worktype', sql.NVarChar, worktype)
        .input('introduced_by', sql.NVarChar, introduced_by || null)
        .input('source', sql.NVarChar, source || null)
        .input('notes', sql.NVarChar, notes || null)
        .query(`
          INSERT INTO expert_recommendations (
            submitted_by, prefix, first_name, last_name, company_name, company_number,
            email, phone, website, cv_url, area_of_work, worktype,
            introduced_by, source, notes, status
          )
          OUTPUT INSERTED.id, INSERTED.created_at
          VALUES (
            @submitted_by, @prefix, @first_name, @last_name, @company_name, @company_number,
            @email, @phone, @website, @cv_url, @area_of_work, @worktype,
            @introduced_by, @source, @notes, 'active'
          )
        `);
      return insertResult.recordset?.[0];
    }, 2);

    console.log(`[experts] Created expert ID: ${result?.id}`);
    return res.status(201).json({
      success: true,
      id: result?.id,
      created_at: result?.created_at
    });

  } catch (error) {
    console.error('[experts] POST error:', error);
    return res.status(500).json({ error: 'Failed to create expert', details: error.message });
  }
});

/**
 * PUT /api/experts/:id
 * Update expert recommendation
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      prefix,
      first_name,
      last_name,
      company_name,
      company_number,
      email,
      phone,
      website,
      cv_url,
      area_of_work,
      worktype,
      introduced_by,
      source,
      notes,
      status
    } = req.body;

    await withRequest(getConnectionString(), async (request) => {
      await request
        .input('id', sql.Int, parseInt(id, 10))
        .input('prefix', sql.NVarChar, prefix || null)
        .input('first_name', sql.NVarChar, first_name)
        .input('last_name', sql.NVarChar, last_name)
        .input('company_name', sql.NVarChar, company_name || null)
        .input('company_number', sql.NVarChar, company_number || null)
        .input('email', sql.NVarChar, email || null)
        .input('phone', sql.NVarChar, phone || null)
        .input('website', sql.NVarChar, website || null)
        .input('cv_url', sql.NVarChar, cv_url || null)
        .input('area_of_work', sql.NVarChar, area_of_work)
        .input('worktype', sql.NVarChar, worktype)
        .input('introduced_by', sql.NVarChar, introduced_by || null)
        .input('source', sql.NVarChar, source || null)
        .input('notes', sql.NVarChar, notes || null)
        .input('status', sql.NVarChar, status || 'active')
        .query(`
          UPDATE expert_recommendations
          SET 
            prefix = @prefix,
            first_name = @first_name,
            last_name = @last_name,
            company_name = @company_name,
            company_number = @company_number,
            email = @email,
            phone = @phone,
            website = @website,
            cv_url = @cv_url,
            area_of_work = @area_of_work,
            worktype = @worktype,
            introduced_by = @introduced_by,
            source = @source,
            notes = @notes,
            status = @status
          WHERE id = @id
        `);
    }, 2);

    console.log(`[experts] Updated expert ID: ${id}`);
    return res.json({ success: true, id: parseInt(id, 10) });

  } catch (error) {
    console.error('[experts] PUT error:', error);
    return res.status(500).json({ error: 'Failed to update expert', details: error.message });
  }
});

/**
 * DELETE /api/experts/:id
 * Archive expert (soft delete)
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await withRequest(getConnectionString(), async (request) => {
      await request
        .input('id', sql.Int, parseInt(id, 10))
        .query(`
          UPDATE expert_recommendations
          SET status = 'archived'
          WHERE id = @id
        `);
    }, 2);

    console.log(`[experts] Archived expert ID: ${id}`);
    return res.json({ success: true, archived: true });

  } catch (error) {
    console.error('[experts] DELETE error:', error);
    return res.status(500).json({ error: 'Failed to archive expert', details: error.message });
  }
});

/**
 * GET /api/experts/export/csv
 * Export experts as CSV
 */
router.get('/export/csv', async (req, res) => {
  try {
    const { area_of_work, status = 'active' } = req.query;

    const rows = await withRequest(getConnectionString(), async (request) => {
      let query = `
        SELECT 
          first_name, last_name, prefix, company_name, company_number,
          email, phone, website, area_of_work, worktype,
          introduced_by, source, notes, created_at
        FROM expert_recommendations
        WHERE status = @status
      `;
      request.input('status', sql.NVarChar, status);

      if (area_of_work) {
        request.input('area_of_work', sql.NVarChar, area_of_work);
        query += ` AND area_of_work = @area_of_work`;
      }

      query += ` ORDER BY area_of_work, last_name, first_name`;

      const result = await request.query(query);
      return result.recordset || [];
    }, 2);

    // Build CSV
    const headers = [
      'First Name', 'Last Name', 'Prefix', 'Company', 'Company Number',
      'Email', 'Phone', 'Website', 'Area of Work', 'Work Type',
      'Introduced By', 'Source', 'Notes', 'Created At'
    ];
    
    const csvRows = [headers.join(',')];
    for (const row of rows) {
      const values = [
        row.first_name, row.last_name, row.prefix, row.company_name, row.company_number,
        row.email, row.phone, row.website, row.area_of_work, row.worktype,
        row.introduced_by, row.source, row.notes, row.created_at
      ].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`);
      csvRows.push(values.join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="experts_${area_of_work || 'all'}_${new Date().toISOString().split('T')[0]}.csv"`);
    return res.send(csvRows.join('\n'));

  } catch (error) {
    console.error('[experts] CSV export error:', error);
    return res.status(500).json({ error: 'Failed to export experts', details: error.message });
  }
});

module.exports = router;
