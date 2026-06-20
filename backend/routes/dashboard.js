const express = require('express');
const router = express.Router();
const db = require('../db');

// 仪表盘统计
router.get('/stats/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    // 总任务数
    const [total] = await db.query(
      'SELECT COUNT(*) as count FROM t_task WHERE assignee_id = ?', [userId]
    );

    // 各状态任务数
    const [statusCounts] = await db.query(
      'SELECT status, COUNT(*) as count FROM t_task WHERE assignee_id = ? GROUP BY status', [userId]
    );

    // 逾期任务数
    const [overdue] = await db.query(
      `SELECT COUNT(*) as count FROM t_task
       WHERE assignee_id = ? AND status IN ('pending','in_progress')
       AND deadline IS NOT NULL AND deadline < NOW()`, [userId]
    );

    // 今日到期
    const [todayDue] = await db.query(
      `SELECT COUNT(*) as count FROM t_task
       WHERE assignee_id = ? AND status IN ('pending','in_progress')
       AND deadline IS NOT NULL AND DATE(deadline) = CURDATE()`, [userId]
    );

    // 完成率
    const [completionRate] = await db.query(
      `SELECT
        ROUND(SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END)*100.0/COUNT(*), 1) as rate
       FROM t_task WHERE assignee_id = ?`, [userId]
    );

    // 效率统计
    const [efficiency] = await db.query(
      'SELECT * FROM v_user_efficiency WHERE user_id = ?', [userId]
    );

    // 艾森豪威尔分布
    const [eisenhower] = await db.query(
      'SELECT * FROM v_eisenhower_summary WHERE assignee_id = ?', [userId]
    );

    // 行为日志最近10条
    const [recentLogs] = await db.query(
      `SELECT action_type, action_detail, created_at
       FROM t_behavior_log WHERE user_id = ?
       ORDER BY created_at DESC LIMIT 10`, [userId]
    );

    res.json({
      success: true,
      data: {
        total_tasks: total[0].count,
        status_counts: statusCounts,
        overdue_count: overdue[0].count,
        today_due_count: todayDue[0].count,
        completion_rate: completionRate[0].rate || 0,
        efficiency,
        eisenhower,
        recent_logs: recentLogs
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 优先级排名
router.get('/ranking/:userId', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM v_task_priority_ranking WHERE task_id IN (SELECT task_id FROM t_task WHERE assignee_id = ?)',
      [req.params.userId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
