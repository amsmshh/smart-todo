const express = require('express');
const router = express.Router();
const db = require('../db');

// 获取排序后的任务列表
router.get('/', async (req, res) => {
  try {
    const { user_id = 1, project_id, status, search } = req.query;

    let data;
    if (status === 'active') {
      // 待完成：返回 pending + in_progress（不含已完成/已取消/被阻塞）
      const [rows] = await db.query(
        `SELECT t.task_id, t.title, t.status, t.priority_level, t.deadline,
                t.estimated_hours, t.eisenhower_quadrant,
                eq.name AS quadrant_name, p.project_name, c.category_name,
                COALESCE(s.total_score, 0) AS smart_score,
                COALESCE(s.urgency_score, 0) AS urgency,
                COALESCE(s.importance_score, 0) AS importance,
                COALESCE(s.dependency_score, 0) AS dependency,
                COALESCE(s.energy_score, 0) AS energy,
                COALESCE(s.history_score, 0) AS history_prob,
                DENSE_RANK() OVER (ORDER BY COALESCE(s.total_score, 0) DESC) AS priority_rank
         FROM t_task t
         LEFT JOIN t_smart_score s ON t.task_id = s.task_id
           AND s.scored_at = (SELECT MAX(scored_at) FROM t_smart_score WHERE task_id = t.task_id)
         LEFT JOIN t_project p ON t.project_id = p.project_id
         LEFT JOIN t_category c ON t.category_id = c.category_id
         LEFT JOIN t_eisenhower_matrix eq ON t.eisenhower_quadrant = eq.quadrant
         WHERE t.assignee_id = ?
           AND t.status IN ('pending', 'in_progress')
           AND (? IS NULL OR t.project_id = ?)
         ORDER BY COALESCE(s.total_score, 0) DESC, t.deadline ASC`,
        [user_id, project_id || null, project_id || null]
      );
      data = rows;
    } else {
      const [rows] = await db.query(
        'CALL sp_get_sorted_tasks(?, ?, ?)',
        [user_id, project_id || null, status || null]
      );
      data = rows[0];
    }

    if (search) {
      const kw = search.toLowerCase();
      data = data.filter(t => t.title && t.title.toLowerCase().includes(kw));
    }
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 获取单个任务详情
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM v_task_full_info WHERE task_id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, message: '任务不存在' });

    // 获取标签
    const [tags] = await db.query(
      `SELECT t.tag_id, t.tag_name, t.color FROM t_tag t
       JOIN t_task_tag tt ON t.tag_id = tt.tag_id WHERE tt.task_id = ?`,
      [req.params.id]
    );

    // 获取依赖
    const [deps] = await db.query('SELECT * FROM v_task_dependencies WHERE task_id = ?', [req.params.id]);
    const [revDeps] = await db.query('SELECT * FROM v_task_dependencies WHERE depends_on_id = ?', [req.params.id]);

    // 获取最新评分
    const [scores] = await db.query(
      'SELECT * FROM t_smart_score WHERE task_id = ? ORDER BY scored_at DESC LIMIT 5',
      [req.params.id]
    );

    res.json({
      success: true,
      data: { ...rows[0], tags, dependencies: deps, dependents: revDeps, scores }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 创建任务
router.post('/', async (req, res) => {
  try {
    const { title, description, priority_level, deadline, estimated_hours, project_id, category_id, assignee_id = 1, tags } = req.body;
    const [result] = await db.query(
      `INSERT INTO t_task (title, description, priority_level, deadline, estimated_hours, project_id, category_id, assignee_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, description, priority_level || 3, deadline, estimated_hours, project_id, category_id, assignee_id]
    );
    const taskId = result.insertId;

    // 关联标签
    if (tags && tags.length > 0) {
      const values = tags.map(tagId => [taskId, tagId]);
      await db.query('INSERT INTO t_task_tag (task_id, tag_id) VALUES ?', [values]);
    }

    // 自动评分
    let score = null;
    try {
      await db.query('CALL sp_calculate_smart_score(?, NULL, @total)', [taskId]);
      const [scoreRows] = await db.query('SELECT @total as total_score');
      score = scoreRows[0]?.total_score;
    } catch (e) { /* 评分失败不影响创建 */ }

    res.json({ success: true, data: { task_id: taskId, smart_score: score } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 更新任务
router.put('/:id', async (req, res) => {
  try {
    const { title, description, status, priority_level, deadline, estimated_hours, project_id, category_id, eisenhower_quadrant } = req.body;

    // 如果状态变为 completed，同时设置 completed_at
    let completedAt = undefined;
    if (status === 'completed') {
      completedAt = new Date();
    }

    await db.query(
      `UPDATE t_task SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        status = COALESCE(?, status),
        priority_level = COALESCE(?, priority_level),
        deadline = COALESCE(?, deadline),
        estimated_hours = COALESCE(?, estimated_hours),
        project_id = ?,
        category_id = ?,
        eisenhower_quadrant = ?,
        completed_at = COALESCE(?, completed_at)
       WHERE task_id = ?`,
      [title, description, status, priority_level, deadline, estimated_hours,
       project_id === undefined ? undefined : project_id,
       category_id === undefined ? undefined : category_id,
       eisenhower_quadrant, completedAt, req.params.id]
    );
    res.json({ success: true, message: status === 'completed' ? '任务已完成' : '更新成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 删除任务
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM t_task WHERE task_id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 手动触发智能评分
router.post('/:id/score', async (req, res) => {
  try {
    await db.query('CALL sp_calculate_smart_score(?, NULL, @total)', [req.params.id]);
    const [rows] = await db.query('SELECT @total as total_score');
    res.json({ success: true, data: { total_score: rows[0].total_score } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 添加任务依赖
router.post('/:id/dependencies', async (req, res) => {
  try {
    const { depends_on_id, dep_type = 'FS' } = req.body;
    await db.query('CALL sp_add_task_dependency(?, ?, ?, @result)',
      [req.params.id, depends_on_id, dep_type]);
    const [rows] = await db.query('SELECT @result as result');
    res.json({ success: true, message: rows[0].result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 艾森豪威尔矩阵归类
router.post('/classify/:userId', async (req, res) => {
  try {
    await db.query('CALL sp_classify_eisenhower(?)', [req.params.userId]);
    res.json({ success: true, message: '矩阵归类完成' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 艾森豪威尔矩阵汇总
router.get('/eisenhower/:userId', async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT * FROM v_eisenhower_summary WHERE assignee_id = ?',
      [req.params.userId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 批量刷新评分
router.post('/refresh-scores/all', async (req, res) => {
  try {
    await db.query('CALL sp_refresh_all_scores()');
    res.json({ success: true, message: '批量评分刷新完成' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 批量更新状态
router.post('/batch-status', async (req, res) => {
  try {
    const { ids, status } = req.body;
    if (!ids?.length || !status) return res.status(400).json({ success: false, message: '参数不完整' });
    await db.query('UPDATE t_task SET status = ? WHERE task_id IN (?)', [status, ids]);
    res.json({ success: true, message: `已更新${ids.length}个任务` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 批量删除
router.post('/batch-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids?.length) return res.status(400).json({ success: false, message: '参数不完整' });
    await db.query('DELETE FROM t_task WHERE task_id IN (?)', [ids]);
    res.json({ success: true, message: `已删除${ids.length}个任务` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 更新排序
router.post('/reorder', async (req, res) => {
  try {
    const { orders } = req.body; // [{task_id, sort_order}, ...]
    if (!orders?.length) return res.status(400).json({ success: false, message: '参数不完整' });
    for (const { task_id, sort_order } of orders) {
      await db.query('UPDATE t_task SET sort_order = ? WHERE task_id = ?', [sort_order, task_id]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
