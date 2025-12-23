/**
 * Testing Record Controller
 * CRUD operations for testing records
 */

const pool = require('../config/db');

/**
 * Get all testing records
 * GET /api/testing-records
 * Query params: technician (technician name or ID)
 */
const getAllTestingRecords = async (req, res) => {
  try {
    const { technician } = req.query;
    
    let query = `
      SELECT 
        tr.id, tr.job_card_id, tr.test_date,
        tr.before_pressure, tr.before_leak, tr.before_calibration, tr.before_pass_fail,
        tr.after_pressure, tr.after_leak, tr.after_calibration, tr.after_pass_fail,
        tr.pilot_injection, tr.main_injection, tr.return_flow, tr.injector_pressure, tr.leak_test,
        tr.created_at, tr.updated_at,
        jc.job_no, jc.brand, jc.job_type, jc.technician_id,
        c.name AS customer_name,
        u.name AS technician_name
      FROM testing_records tr
      LEFT JOIN job_cards jc ON tr.job_card_id = jc.id
      LEFT JOIN customers c ON jc.customer_id = c.id
      LEFT JOIN users u ON jc.technician_id = u.id
      WHERE 1=1
    `;
    
    const params = [];
    
    // Filter by technician if provided
    if (technician) {
      // Try to match by technician name first
      query += ` AND u.name = ?`;
      params.push(technician);
    }
    
    query += ` ORDER BY tr.created_at DESC`;

    const [records] = await pool.execute(query, params);

    // Format response
    const formattedRecords = records.map(tr => ({
      id: tr.id,
      jobCardNumber: tr.job_no,
      customerName: tr.customer_name,
      jobType: tr.job_type,
      brand: tr.brand,
      beforeRepair: {
        pressure: tr.before_pressure,
        leak: tr.before_leak,
        calibration: tr.before_calibration,
        passFail: tr.before_pass_fail
      },
      afterRepair: {
        pressure: tr.after_pressure,
        leak: tr.after_leak,
        calibration: tr.after_calibration,
        passFail: tr.after_pass_fail
      },
      injectorParams: {
        pilotInjection: tr.pilot_injection,
        mainInjection: tr.main_injection,
        returnFlow: tr.return_flow,
        pressure: tr.injector_pressure,
        leakTest: tr.leak_test
      },
      testDate: tr.test_date ? tr.test_date.toISOString().split('T')[0] : null,
      createdAt: tr.created_at,
      updatedAt: tr.updated_at
    }));

    res.json({
      success: true,
      data: formattedRecords,
      count: formattedRecords.length
    });
  } catch (error) {
    console.error('Get all testing records error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch testing records'
    });
  }
};

/**
 * Get testing record by ID
 * GET /api/testing-records/:id
 */
const getTestingRecordById = async (req, res) => {
  try {
    const { id } = req.params;

    const [records] = await pool.execute(
      `SELECT 
        tr.id, tr.job_card_id, tr.test_date,
        tr.before_pressure, tr.before_leak, tr.before_calibration, tr.before_pass_fail,
        tr.after_pressure, tr.after_leak, tr.after_calibration, tr.after_pass_fail,
        tr.pilot_injection, tr.main_injection, tr.return_flow, tr.injector_pressure, tr.leak_test,
        tr.created_at, tr.updated_at,
        jc.job_no, jc.brand, jc.job_type,
        c.name AS customer_name
      FROM testing_records tr
      LEFT JOIN job_cards jc ON tr.job_card_id = jc.id
      LEFT JOIN customers c ON jc.customer_id = c.id
      WHERE tr.id = ?`,
      [id]
    );

    if (records.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Testing record not found'
      });
    }

    const tr = records[0];
    const formattedRecord = {
      id: tr.id,
      jobCardNumber: tr.job_no,
      customerName: tr.customer_name,
      jobType: tr.job_type,
      brand: tr.brand,
      beforeRepair: {
        pressure: tr.before_pressure,
        leak: tr.before_leak,
        calibration: tr.before_calibration,
        passFail: tr.before_pass_fail
      },
      afterRepair: {
        pressure: tr.after_pressure,
        leak: tr.after_leak,
        calibration: tr.after_calibration,
        passFail: tr.after_pass_fail
      },
      injectorParams: {
        pilotInjection: tr.pilot_injection,
        mainInjection: tr.main_injection,
        returnFlow: tr.return_flow,
        pressure: tr.injector_pressure,
        leakTest: tr.leak_test
      },
      testDate: tr.test_date ? tr.test_date.toISOString().split('T')[0] : null
    };

    res.json({
      success: true,
      data: formattedRecord
    });
  } catch (error) {
    console.error('Get testing record by ID error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch testing record'
    });
  }
};

/**
 * Create new testing record
 * POST /api/testing-records
 * Body: { jobCardNumber, customerName, jobType, brand, beforeRepair, afterRepair, injectorParams, testDate }
 */
const createTestingRecord = async (req, res) => {
  try {
    let {
      jobCardNumber,
      customerName,
      jobType,
      brand,
      beforeRepair,
      afterRepair,
      injectorParams,
      testDate
    } = req.body;

    // Parse JSON strings if needed (from FormData)
    if (typeof beforeRepair === 'string') {
      beforeRepair = JSON.parse(beforeRepair);
    }
    if (typeof afterRepair === 'string') {
      afterRepair = JSON.parse(afterRepair);
    }
    if (typeof injectorParams === 'string') {
      injectorParams = JSON.parse(injectorParams);
    }

    // Find job card by job number
    const [jobCards] = await pool.execute(
      `SELECT jc.id, jc.technician_id, u.name AS technician_name 
       FROM job_cards jc
       LEFT JOIN users u ON jc.technician_id = u.id
       WHERE jc.job_no = ?`,
      [jobCardNumber]
    );

    if (jobCards.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Job card not found'
      });
    }

    const jobCard = jobCards[0];
    const jobCardId = jobCard.id;
    
    // If user is technician, verify they own this job card
    if (req.user && req.user.role === 'technician') {
      if (jobCard.technician_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'You can only create testing records for your assigned job cards'
        });
      }
    }

    // Insert testing record
    const [result] = await pool.execute(
      `INSERT INTO testing_records (
        job_card_id, test_date,
        before_pressure, before_leak, before_calibration, before_pass_fail,
        after_pressure, after_leak, after_calibration, after_pass_fail,
        pilot_injection, main_injection, return_flow, injector_pressure, leak_test,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        jobCardId,
        testDate || new Date().toISOString().split('T')[0],
        beforeRepair?.pressure || null,
        beforeRepair?.leak || null,
        beforeRepair?.calibration || null,
        beforeRepair?.passFail || 'Fail',
        afterRepair?.pressure || null,
        afterRepair?.leak || null,
        afterRepair?.calibration || null,
        afterRepair?.passFail || 'Fail',
        injectorParams?.pilotInjection || null,
        injectorParams?.mainInjection || null,
        injectorParams?.returnFlow || null,
        injectorParams?.pressure || null,
        injectorParams?.leakTest || 'Fail'
      ]
    );

    // Fetch created record
    const [records] = await pool.execute(
      `SELECT 
        tr.id, tr.job_card_id, tr.test_date,
        tr.before_pressure, tr.before_leak, tr.before_calibration, tr.before_pass_fail,
        tr.after_pressure, tr.after_leak, tr.after_calibration, tr.after_pass_fail,
        tr.pilot_injection, tr.main_injection, tr.return_flow, tr.injector_pressure, tr.leak_test,
        jc.job_no, jc.brand, jc.job_type,
        c.name AS customer_name
      FROM testing_records tr
      LEFT JOIN job_cards jc ON tr.job_card_id = jc.id
      LEFT JOIN customers c ON jc.customer_id = c.id
      WHERE tr.id = ?`,
      [result.insertId]
    );

    const tr = records[0];
    const formattedRecord = {
      id: tr.id,
      jobCardNumber: tr.job_no,
      customerName: tr.customer_name,
      jobType: tr.job_type,
      brand: tr.brand,
      beforeRepair: {
        pressure: tr.before_pressure,
        leak: tr.before_leak,
        calibration: tr.before_calibration,
        passFail: tr.before_pass_fail
      },
      afterRepair: {
        pressure: tr.after_pressure,
        leak: tr.after_leak,
        calibration: tr.after_calibration,
        passFail: tr.after_pass_fail
      },
      injectorParams: {
        pilotInjection: tr.pilot_injection,
        mainInjection: tr.main_injection,
        returnFlow: tr.return_flow,
        pressure: tr.injector_pressure,
        leakTest: tr.leak_test
      },
      testDate: tr.test_date ? tr.test_date.toISOString().split('T')[0] : null
    };

    res.status(201).json({
      success: true,
      message: 'Testing record created successfully',
      data: formattedRecord
    });
  } catch (error) {
    console.error('Create testing record error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create testing record'
    });
  }
};

/**
 * Update testing record
 * PUT /api/testing-records/:id
 */
const updateTestingRecord = async (req, res) => {
  try {
    const { id } = req.params;
    let {
      beforeRepair,
      afterRepair,
      injectorParams,
      testDate
    } = req.body;

    // Parse JSON strings if needed
    if (typeof beforeRepair === 'string') {
      beforeRepair = JSON.parse(beforeRepair);
    }
    if (typeof afterRepair === 'string') {
      afterRepair = JSON.parse(afterRepair);
    }
    if (typeof injectorParams === 'string') {
      injectorParams = JSON.parse(injectorParams);
    }

    // Check if record exists and get job card info
    const [existingRecords] = await pool.execute(
      `SELECT tr.id, tr.job_card_id, jc.technician_id 
       FROM testing_records tr
       LEFT JOIN job_cards jc ON tr.job_card_id = jc.id
       WHERE tr.id = ?`,
      [id]
    );

    if (existingRecords.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Testing record not found'
      });
    }
    
    // If user is technician, verify they own this testing record's job card
    if (req.user && req.user.role === 'technician') {
      if (existingRecords[0].technician_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'You can only update testing records for your assigned job cards'
        });
      }
    }

    // Build update query
    const updates = [];
    const params = [];

    if (beforeRepair) {
      if (beforeRepair.pressure !== undefined) {
        updates.push('before_pressure = ?');
        params.push(beforeRepair.pressure);
      }
      if (beforeRepair.leak !== undefined) {
        updates.push('before_leak = ?');
        params.push(beforeRepair.leak);
      }
      if (beforeRepair.calibration !== undefined) {
        updates.push('before_calibration = ?');
        params.push(beforeRepair.calibration);
      }
      if (beforeRepair.passFail !== undefined) {
        updates.push('before_pass_fail = ?');
        params.push(beforeRepair.passFail);
      }
    }

    if (afterRepair) {
      if (afterRepair.pressure !== undefined) {
        updates.push('after_pressure = ?');
        params.push(afterRepair.pressure);
      }
      if (afterRepair.leak !== undefined) {
        updates.push('after_leak = ?');
        params.push(afterRepair.leak);
      }
      if (afterRepair.calibration !== undefined) {
        updates.push('after_calibration = ?');
        params.push(afterRepair.calibration);
      }
      if (afterRepair.passFail !== undefined) {
        updates.push('after_pass_fail = ?');
        params.push(afterRepair.passFail);
      }
    }

    if (injectorParams) {
      if (injectorParams.pilotInjection !== undefined) {
        updates.push('pilot_injection = ?');
        params.push(injectorParams.pilotInjection);
      }
      if (injectorParams.mainInjection !== undefined) {
        updates.push('main_injection = ?');
        params.push(injectorParams.mainInjection);
      }
      if (injectorParams.returnFlow !== undefined) {
        updates.push('return_flow = ?');
        params.push(injectorParams.returnFlow);
      }
      if (injectorParams.pressure !== undefined) {
        updates.push('injector_pressure = ?');
        params.push(injectorParams.pressure);
      }
      if (injectorParams.leakTest !== undefined) {
        updates.push('leak_test = ?');
        params.push(injectorParams.leakTest);
      }
    }

    if (testDate) {
      updates.push('test_date = ?');
      params.push(testDate);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    updates.push('updated_at = NOW()');
    params.push(id);

    await pool.execute(
      `UPDATE testing_records SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    // Fetch updated record
    const [records] = await pool.execute(
      `SELECT 
        tr.id, tr.job_card_id, tr.test_date,
        tr.before_pressure, tr.before_leak, tr.before_calibration, tr.before_pass_fail,
        tr.after_pressure, tr.after_leak, tr.after_calibration, tr.after_pass_fail,
        tr.pilot_injection, tr.main_injection, tr.return_flow, tr.injector_pressure, tr.leak_test,
        jc.job_no, jc.brand, jc.job_type,
        c.name AS customer_name
      FROM testing_records tr
      LEFT JOIN job_cards jc ON tr.job_card_id = jc.id
      LEFT JOIN customers c ON jc.customer_id = c.id
      WHERE tr.id = ?`,
      [id]
    );

    const tr = records[0];
    const formattedRecord = {
      id: tr.id,
      jobCardNumber: tr.job_no,
      customerName: tr.customer_name,
      jobType: tr.job_type,
      brand: tr.brand,
      beforeRepair: {
        pressure: tr.before_pressure,
        leak: tr.before_leak,
        calibration: tr.before_calibration,
        passFail: tr.before_pass_fail
      },
      afterRepair: {
        pressure: tr.after_pressure,
        leak: tr.after_leak,
        calibration: tr.after_calibration,
        passFail: tr.after_pass_fail
      },
      injectorParams: {
        pilotInjection: tr.pilot_injection,
        mainInjection: tr.main_injection,
        returnFlow: tr.return_flow,
        pressure: tr.injector_pressure,
        leakTest: tr.leak_test
      },
      testDate: tr.test_date ? tr.test_date.toISOString().split('T')[0] : null
    };

    res.json({
      success: true,
      message: 'Testing record updated successfully',
      data: formattedRecord
    });
  } catch (error) {
    console.error('Update testing record error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update testing record'
    });
  }
};

/**
 * Delete testing record
 * DELETE /api/testing-records/:id
 */
const deleteTestingRecord = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if record exists and get job card info
    const [records] = await pool.execute(
      `SELECT tr.id, tr.job_card_id, jc.technician_id 
       FROM testing_records tr
       LEFT JOIN job_cards jc ON tr.job_card_id = jc.id
       WHERE tr.id = ?`,
      [id]
    );

    if (records.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Testing record not found'
      });
    }
    
    // If user is technician, verify they own this testing record's job card
    if (req.user && req.user.role === 'technician') {
      if (records[0].technician_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'You can only delete testing records for your assigned job cards'
        });
      }
    }

    // Delete record
    await pool.execute('DELETE FROM testing_records WHERE id = ?', [id]);

    res.json({
      success: true,
      message: 'Testing record deleted successfully'
    });
  } catch (error) {
    console.error('Delete testing record error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete testing record'
    });
  }
};

module.exports = {
  getAllTestingRecords,
  getTestingRecordById,
  createTestingRecord,
  updateTestingRecord,
  deleteTestingRecord
};

