const express = require('express');
const router = express.Router();
const db = require('../db');

// 安全错误信息（不暴露SQL细节）
function safeMsg(err) {
  if (err.code === 'ER_DUP_ENTRY') return '数据重复';
  if (err.code === 'ER_NO_REFERENCED_ROW_2') return '关联数据不存在';
  if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED') return '数据不合法';
  return '操作失败，请稍后重试';
}

// 获取排序后的任务列表
router.get('/', async (req, res) => {
  try {
    const { user_id = 1, project_id, status, search } = req.query;

    let data;
    if (status === 'active') {
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
    res.status(500).json({ success: false, message: safeMsg(err) });
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

    const [tags] = await db.query(
      `SELECT t.tag_id, t.tag_name, t.color FROM t_tag t
       JOIN t_task_tag tt ON t.tag_id = tt.tag_id WHERE tt.task_id = ?`,
      [req.params.id]
    );

    const [deps] = await db.query('SELECT * FROM v_task_dependencies WHERE task_id = ?', [req.params.id]);
    const [revDeps] = await db.query('SELECT * FROM v_task_dependencies WHERE depends_on_id = ?', [req.params.id]);

    const [scores] = await db.query(
      'SELECT * FROM t_smart_score WHERE task_id = ? ORDER BY scored_at DESC LIMIT 5',
      [req.params.id]
    );

    res.json({
      success: true,
      data: { ...rows[0], tags, dependencies: deps, dependents: revDeps, scores }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: safeMsg(err) });
  }
});

// 创建任务
router.post('/', async (req, res) => {
  try {
    const { title, description, priority_level, deadline, estimated_hours, project_id, category_id, assignee_id = 1, tags } = req.body;

    // 输入校验
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: '标题不能为空' });
    }
    const pl = Number(priority_level) || 3;
    if (pl < 1 || pl > 5) {
      return res.status(400).json({ success: false, message: '优先级必须在1-5之间' });
    }

    const [result] = await db.query(
      `INSERT INTO t_task (title, description, priority_level, deadline, estimated_hours, project_id, category_id, assignee_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [title.trim(), description || null, pl, deadline || null, estimated_hours || null, project_id || null, category_id || null, assignee_id]
    );
    const taskId = result.insertId;

    // 关联标签
    if (tags && tags.length > 0) {
      const values = tags.map(tagId => [taskId, tagId]);
      await db.query('INSERT INTO t_task_tag (task_id, tag_id) VALUES ?', [values]);
    }

    // 自动评分（用同一连接避免session变量串值）
    let score = null;
    const conn = await db.getConnection();
    try {
      await conn.query('CALL sp_calculate_smart_score(?, NULL, @total)', [taskId]);
      const [scoreRows] = await conn.query('SELECT @total as total_score');
      score = scoreRows[0]?.total_score;
    } catch (e) { /* 评分失败不影响创建 */ }
    finally { conn.release(); }

    res.json({ success: true, data: { task_id: taskId, smart_score: score } });
  } catch (err) {
    res.status(500).json({ success: false, message: safeMsg(err) });
  }
});

// 更新任务
router.put('/:id', async (req, res) => {
  try {
    // 先检查任务是否存在
    const [existing] = await db.query('SELECT task_id FROM t_task WHERE task_id = ?', [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: '任务不存在' });
    }

    const { title, description, status, priority_level, deadline, estimated_hours, project_id, category_id, eisenhower_quadrant } = req.body;

    // 优先级校验
    if (priority_level !== undefined) {
      const pl = Number(priority_level);
      if (pl < 1 || pl > 5) {
        return res.status(400).json({ success: false, message: '优先级必须在1-5之间' });
      }
    }

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
        project_id = COALESCE(?, project_id),
        category_id = COALESCE(?, category_id),
        eisenhower_quadrant = COALESCE(?, eisenhower_quadrant),
        completed_at = COALESCE(?, completed_at)
       WHERE task_id = ?`,
      [title, description, status, priority_level, deadline, estimated_hours,
       project_id === undefined ? null : project_id,
       category_id === undefined ? null : category_id,
       eisenhower_quadrant, completedAt, req.params.id]
    );

    // 完成任务后，自动解除被阻塞的后续任务
    if (status === 'completed') {
      // 第1步：找到所有可解除阻塞的后续任务ID
      const [blockedTasks] = await db.query(
        `SELECT td.task_id FROM t_task_dependency td
         WHERE td.depends_on_id = ?
           AND (SELECT status FROM t_task WHERE task_id = td.task_id) = 'blocked'`,
        [req.params.id]
      );

      // 第2步：检查每个被阻塞任务的所有前置任务是否都已完成
      for (const row of blockedTasks) {
        const [pendingDeps] = await db.query(
          `SELECT COUNT(*) as cnt FROM t_task_dependency td2
           JOIN t_task t2 ON td2.depends_on_id = t2.task_id
           WHERE td2.task_id = ? AND t2.status != 'completed'`,
          [row.task_id]
        );
        if (pendingDeps[0].cnt === 0) {
          await db.query('UPDATE t_task SET status = ? WHERE task_id = ?', ['pending', row.task_id]);
        }
      }
    }

    res.json({ success: true, message: status === 'completed' ? '任务已完成' : '更新成功' });
  } catch (err) {
    res.status(500).json({ success: false, message: safeMsg(err) });
  }
});

// 删除任务
router.delete('/:id', async (req, res) => {
  try {
    const [existing] = await db.query('SELECT task_id FROM t_task WHERE task_id = ?', [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: '任务不存在' });
    }
    await db.query('DELETE FROM t_task WHERE task_id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: safeMsg(err) });
  }
});

// 手动触发智能评分
router.post('/:id/score', async (req, res) => {
  try {
    const conn = await db.getConnection();
    try {
      await conn.query('CALL sp_calculate_smart_score(?, NULL, @total)', [req.params.id]);
      const [rows] = await conn.query('SELECT @total as total_score');
      res.json({ success: true, data: { total_score: rows[0].total_score } });
    } finally {
      conn.release();
    }
  } catch (err) {
    res.status(500).json({ success: false, message: safeMsg(err) });
  }
});

// 添加任务依赖
router.post('/:id/dependencies', async (req, res) => {
  try {
    const { depends_on_id, dep_type = 'FS' } = req.body;
    const conn = await db.getConnection();
    try {
      await conn.query('CALL sp_add_task_dependency(?, ?, ?, @result)',
        [req.params.id, depends_on_id, dep_type]);
      const [rows] = await conn.query('SELECT @result as result');
      res.json({ success: true, message: rows[0].result });
    } finally {
      conn.release();
    }
  } catch (err) {
    res.status(500).json({ success: false, message: safeMsg(err) });
  }
});

// 艾森豪威尔矩阵归类
router.post('/classify/:userId', async (req, res) => {
  try {
    await db.query('CALL sp_classify_eisenhower(?)', [req.params.userId]);
    res.json({ success: true, message: '矩阵归类完成' });
  } catch (err) {
    res.status(500).json({ success: false, message: safeMsg(err) });
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
    res.status(500).json({ success: false, message: safeMsg(err) });
  }
});

// 批量刷新评分
router.post('/refresh-scores/all', async (req, res) => {
  try {
    await db.query('CALL sp_refresh_all_scores()');
    res.json({ success: true, message: '批量评分刷新完成' });
  } catch (err) {
    res.status(500).json({ success: false, message: safeMsg(err) });
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
    res.status(500).json({ success: false, message: safeMsg(err) });
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
    res.status(500).json({ success: false, message: safeMsg(err) });
  }
});

// 更新排序（用事务批量更新，避免N+1查询）
router.post('/reorder', async (req, res) => {
  const conn = await db.getConnection();
  try {
    const { orders } = req.body;
    if (!orders?.length) return res.status(400).json({ success: false, message: '参数不完整' });

    await conn.beginTransaction();
    for (const { task_id, sort_order } of orders) {
      await conn.query('UPDATE t_task SET sort_order = ? WHERE task_id = ?', [sort_order, task_id]);
    }
    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ success: false, message: safeMsg(err) });
  } finally {
    conn.release();
  }
});

module.exports = router;
