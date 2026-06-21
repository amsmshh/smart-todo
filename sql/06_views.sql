-- ================================================================
-- 智能待办事项优先级排序器 - 视图
-- ================================================================

USE smart_todo;

-- ================================================================
-- 1. 任务完整信息视图
--    关联任务、项目、分类、用户，提供一站式查询
-- ================================================================
CREATE OR REPLACE VIEW v_task_full_info AS
SELECT
  t.task_id,
  t.title,
  t.description,
  t.status,
  t.priority_level,
  t.deadline,
  t.estimated_hours,
  t.actual_hours,
  t.eisenhower_quadrant,
  eq.name AS quadrant_name,
  eq.action_strategy AS quadrant_strategy,
  p.project_id,
  p.project_name,
  c.category_id,
  c.category_name,
  u.user_id AS assignee_id,
  u.username AS assignee_name,
  t.created_at,
  t.completed_at,
  t.updated_at,
  fn_get_dep_depth(t.task_id) AS dep_depth
FROM t_task t
LEFT JOIN t_project p ON t.project_id = p.project_id
LEFT JOIN t_category c ON t.category_id = c.category_id
LEFT JOIN t_eisenhower_matrix eq ON t.eisenhower_quadrant = eq.quadrant
JOIN t_user u ON t.assignee_id = u.user_id;

-- ================================================================
-- 2. 任务优先级排名视图 (核心)
--    展示每个待办任务的最新评分和排名
-- ================================================================
CREATE OR REPLACE VIEW v_task_priority_ranking AS
SELECT
  t.task_id,
  t.title,
  t.status,
  t.priority_level,
  t.deadline,
  t.project_id,
  p.project_name,
  c.category_name,
  COALESCE(s.total_score, 0) AS total_score,
  COALESCE(s.urgency_score, 0) AS urgency_score,
  COALESCE(s.importance_score, 0) AS importance_score,
  COALESCE(s.dependency_score, 0) AS dependency_score,
  COALESCE(s.energy_score, 0) AS energy_score,
  COALESCE(s.history_score, 0) AS history_score,
  s.scored_at,
  DENSE_RANK() OVER (ORDER BY COALESCE(s.total_score, 0) DESC) AS priority_rank,
  eq.name AS quadrant_name,
  fn_get_dep_depth(t.task_id) AS dep_depth,
  fn_get_blocker_count(t.task_id) AS blocking_count
FROM t_task t
LEFT JOIN t_smart_score s ON t.task_id = s.task_id
  AND s.scored_at = (SELECT MAX(scored_at) FROM t_smart_score WHERE task_id = t.task_id)
LEFT JOIN t_project p ON t.project_id = p.project_id
LEFT JOIN t_category c ON t.category_id = c.category_id
LEFT JOIN t_eisenhower_matrix eq ON t.eisenhower_quadrant = eq.quadrant
WHERE t.status IN ('pending', 'in_progress');

-- ================================================================
-- 3. 用户效率统计视图
--    按分类统计任务完成效率
-- ================================================================
CREATE OR REPLACE VIEW v_user_efficiency AS
SELECT
  h.user_id,
  u.username,
  c.category_name,
  COUNT(*) AS total_completed,
  ROUND(AVG(h.actual_hours), 1) AS avg_actual_hours,
  ROUND(AVG(h.planned_hours), 1) AS avg_planned_hours,
  ROUND(AVG(h.delay_days), 1) AS avg_delay_days,
  ROUND(
    SUM(CASE WHEN h.delay_days <= 0 THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1
  ) AS on_time_rate,
  ROUND(AVG(h.actual_hours / NULLIF(h.planned_hours, 0)), 2) AS efficiency_ratio
FROM t_completion_history h
JOIN t_user u ON h.user_id = u.user_id
LEFT JOIN t_category c ON h.category_id = c.category_id
GROUP BY h.user_id, u.username, c.category_name;

-- ================================================================
-- 4. 艾森豪威尔矩阵汇总视图
--    各象限任务数量和平均得分
-- ================================================================
CREATE OR REPLACE VIEW v_eisenhower_summary AS
SELECT
  t.assignee_id,
  t.eisenhower_quadrant,
  m.name AS quadrant_name,
  m.action_strategy,
  m.color,
  COUNT(t.task_id) AS task_count,
  ROUND(AVG(s.total_score), 1) AS avg_score,
  MIN(t.deadline) AS earliest_deadline
FROM t_task t
JOIN t_eisenhower_matrix m ON t.eisenhower_quadrant = m.quadrant
LEFT JOIN t_smart_score s ON t.task_id = s.task_id
  AND s.scored_at = (SELECT MAX(scored_at) FROM t_smart_score WHERE task_id = t.task_id)
WHERE t.status IN ('pending', 'in_progress')
GROUP BY t.assignee_id, t.eisenhower_quadrant, m.name, m.action_strategy, m.color;

-- ================================================================
-- 5. 任务依赖关系详情视图
-- ================================================================
CREATE OR REPLACE VIEW v_task_dependencies AS
SELECT
  td.dep_id,
  td.task_id,
  t1.title AS task_title,
  t1.status AS task_status,
  td.depends_on_id,
  t2.title AS depends_on_title,
  t2.status AS depends_on_status,
  td.dep_type,
  CASE
    WHEN t2.status = 'completed' THEN '已就绪'
    ELSE '等待前置任务'
  END AS readiness
FROM t_task_dependency td
JOIN t_task t1 ON td.task_id = t1.task_id
JOIN t_task t2 ON td.depends_on_id = t2.task_id;
