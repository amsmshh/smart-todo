const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM t_project WHERE status = 1 ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { project_name, description, creator_id = 1, color } = req.body;
    const [result] = await db.query(
      'INSERT INTO t_project (project_name, description, creator_id, color) VALUES (?, ?, ?, ?)',
      [project_name, description, creator_id, color || '#3498db']
    );
    res.json({ success: true, data: { project_id: result.insertId } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
