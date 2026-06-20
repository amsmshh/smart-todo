const express = require('express');
const router = express.Router();
const db = require('../db');

// 用户登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const [rows] = await db.query(
      'SELECT user_id, username, email, avatar_url, status FROM t_user WHERE username = ? AND password_hash = SHA2(?, 256) AND status = 1',
      [username, password]
    );
    if (rows.length === 0) return res.status(401).json({ success: false, message: '用户名或密码错误' });

    // 更新最后登录时间
    await db.query('UPDATE t_user SET last_login = NOW() WHERE user_id = ?', [rows[0].user_id]);

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 用户注册
router.post('/register', async (req, res) => {
  try {
    const { username, password, email } = req.body;

    // 检查用户名是否已存在
    const [existingUser] = await db.query('SELECT user_id FROM t_user WHERE username = ?', [username]);
    if (existingUser.length > 0) {
      return res.status(400).json({ success: false, message: '用户名已存在' });
    }

    // 检查邮箱是否已注册
    const [existingEmail] = await db.query('SELECT user_id FROM t_user WHERE email = ?', [email]);
    if (existingEmail.length > 0) {
      return res.status(400).json({ success: false, message: '邮箱已被注册' });
    }

    // 插入新用户
    const [result] = await db.query(
      'INSERT INTO t_user (username, password_hash, email) VALUES (?, SHA2(?, 256), ?)',
      [username, password, email]
    );
    const newUserId = result.insertId;

    // 为新用户创建默认优先级规则
    await db.query(
      `INSERT INTO t_priority_rule (rule_name, user_id, w_urgency, w_importance, w_dependency, w_energy, w_history, is_default)
       VALUES ('默认均衡规则', ?, 0.30, 0.25, 0.20, 0.15, 0.10, 1)`,
      [newUserId]
    );

    // 初始化精力画像
    await db.query(
      `INSERT INTO t_energy_profile (user_id, day_of_week, hour_slot, energy_level, sample_count)
       SELECT ?, d.d, h.h, 0.5, 0
       FROM (SELECT 1 AS d UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7) d
       CROSS JOIN (SELECT 9 AS h UNION SELECT 10 UNION SELECT 11 UNION SELECT 14 UNION SELECT 15 UNION SELECT 16) h`,
      [newUserId]
    );

    res.json({ success: true, message: '注册成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 获取用户偏好
router.get('/:id/preferences', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT pref_key, pref_value FROM t_user_preference WHERE user_id = ?',
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 保存用户偏好
router.put('/:id/preferences', async (req, res) => {
  try {
    const { pref_key, pref_value } = req.body;
    await db.query(
      `INSERT INTO t_user_preference (user_id, pref_key, pref_value)
       VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE pref_value = ?`,
      [req.params.id, pref_key, pref_value, pref_value]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 获取用户精力画像
router.get('/:id/energy', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT day_of_week, hour_slot, energy_level, sample_count FROM t_energy_profile WHERE user_id = ? ORDER BY day_of_week, hour_slot',
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 获取优先级规则
router.get('/:id/rules', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM t_priority_rule WHERE user_id = ? ORDER BY is_default DESC',
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 更新优先级规则权重
router.put('/:id/rules/:ruleId', async (req, res) => {
  try {
    const { w_urgency, w_importance, w_dependency, w_energy, w_history } = req.body;
    const sum = Number(w_urgency) + Number(w_importance) + Number(w_dependency) + Number(w_energy) + Number(w_history);
    if (Math.abs(sum - 1.0) > 0.01) {
      return res.status(400).json({ success: false, message: '权重之和必须等于1.0' });
    }
    await db.query(
      `UPDATE t_priority_rule SET w_urgency=?, w_importance=?, w_dependency=?, w_energy=?, w_history=?
       WHERE rule_id=? AND user_id=?`,
      [w_urgency, w_importance, w_dependency, w_energy, w_history, req.params.ruleId, req.params.id]
    );
    res.json({ success: true, message: '权重已更新' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
