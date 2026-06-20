-- ================================================================
-- 智能待办事项优先级排序器 - 自定义函数
-- ================================================================

USE smart_todo;

-- ================================================================
-- 1. 紧迫度计算函数
--    使用指数衰减: score = 100 * e^(-hours_remaining/72)
--    72小时为半衰期，已过期返回100，无截止时间返回0
-- ================================================================
DELIMITER $$
CREATE FUNCTION fn_calc_urgency(p_deadline DATETIME)
RETURNS DECIMAL(5,2)
DETERMINISTIC
BEGIN
  DECLARE v_hours_remaining DECIMAL(10,2);

  IF p_deadline IS NULL THEN
    RETURN 0.00;
  END IF;

  SET v_hours_remaining = TIMESTAMPDIFF(SECOND, NOW(), p_deadline) / 3600.0;

  IF v_hours_remaining <= 0 THEN
    RETURN 100.00; -- 已过期
  END IF;

  -- 指数衰减: 越接近截止，得分越高
  RETURN ROUND(100.0 * EXP(-v_hours_remaining / 72.0), 2);
END$$
DELIMITER ;

-- ================================================================
-- 2. 重要度计算函数
--    基础分 = (6 - priority_level) * 20
--    项目内任务数加成
-- ================================================================
DELIMITER $$
CREATE FUNCTION fn_calc_importance(p_priority_level TINYINT, p_project_id INT)
RETURNS DECIMAL(5,2)
DETERMINISTIC
BEGIN
  DECLARE v_base DECIMAL(5,2);
  DECLARE v_bonus DECIMAL(5,2) DEFAULT 0;
  DECLARE v_proj_tasks INT DEFAULT 0;

  -- 基础分: priority 1->100, 2->80, 3->60, 4->40, 5->20
  SET v_base = (6 - p_priority_level) * 20.0;

  -- 项目加成: 项目中待办任务越多，单个任务重要度越高
  IF p_project_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_proj_tasks
    FROM t_task
    WHERE project_id = p_project_id
      AND status IN ('pending', 'in_progress');

    SET v_bonus = LEAST(v_proj_tasks * 3, 15); -- 最多加15分
  END IF;

  RETURN ROUND(LEAST(v_base + v_bonus, 100.00), 2);
END$$
DELIMITER ;

-- ================================================================
-- 3. 依赖链深度计算函数 (递归CTE)
--    返回以p_task_id为根的最大依赖链深度
-- ================================================================
DELIMITER $$
CREATE FUNCTION fn_get_dep_depth(p_task_id INT)
RETURNS INT
DETERMINISTIC
BEGIN
  DECLARE v_depth INT DEFAULT 0;

  -- 使用递归CTE计算依赖链最大深度
  WITH RECURSIVE dep_chain AS (
    -- 锚点: 直接前置任务
    SELECT depends_on_id, 1 AS depth
    FROM t_task_dependency
    WHERE task_id = p_task_id

    UNION ALL

    -- 递归: 前置任务的前置任务
    SELECT td.depends_on_id, dc.depth + 1
    FROM t_task_dependency td
    JOIN dep_chain dc ON td.task_id = dc.depends_on_id
    WHERE dc.depth < 20 -- 防止无限递归
  )
  SELECT COALESCE(MAX(depth), 0) INTO v_depth
  FROM dep_chain;

  RETURN v_depth;
END$$
DELIMITER ;

-- ================================================================
-- 4. 历史完成率计算函数
--    返回用户在指定分类和优先级下的按时完成率(0-100)
-- ================================================================
DELIMITER $$
CREATE FUNCTION fn_get_completion_rate(p_user_id INT, p_category_id INT, p_priority_level TINYINT)
RETURNS DECIMAL(5,2)
DETERMINISTIC
BEGIN
  DECLARE v_total INT DEFAULT 0;
  DECLARE v_ontime INT DEFAULT 0;

  SELECT COUNT(*),
         SUM(CASE WHEN delay_days <= 0 THEN 1 ELSE 0 END)
  INTO v_total, v_ontime
  FROM t_completion_history
  WHERE user_id = p_user_id
    AND (p_category_id IS NULL OR category_id = p_category_id)
    AND priority_level = p_priority_level;

  IF v_total = 0 THEN
    -- 无历史数据，返回中性值50
    RETURN 50.00;
  END IF;

  RETURN ROUND(v_ontime * 100.0 / v_total, 2);
END$$
DELIMITER ;

-- ================================================================
-- 5. 精力匹配度计算函数
--    返回当前时段用户精力与任务难度的匹配度(0-100)
-- ================================================================
DELIMITER $$
CREATE FUNCTION fn_calc_energy_match(p_user_id INT, p_priority_level TINYINT)
RETURNS DECIMAL(5,2)
DETERMINISTIC
BEGIN
  DECLARE v_energy DECIMAL(3,2) DEFAULT 0.5;
  DECLARE v_demand DECIMAL(3,2);
  DECLARE v_match DECIMAL(5,2);

  -- 获取当前时段的精力水平
  SELECT COALESCE(energy_level, 0.5) INTO v_energy
  FROM t_energy_profile
  WHERE user_id = p_user_id
    AND day_of_week = DAYOFWEEK(NOW()) -- MySQL: 1=Sunday, 2=Monday...
    AND hour_slot = HOUR(NOW())
  LIMIT 1;

  -- 任务精力需求: priority越高(数值越小)需求越高
  SET v_demand = (6 - p_priority_level) / 5.0; -- 1->1.0, 5->0.2

  -- 匹配度: 精力越高且需求越高 -> 高分
  -- 精力低但需求也低 -> 高分
  -- 精力低但需求高 -> 低分
  SET v_match = 100.0 * (1.0 - ABS(v_energy - v_demand));

  RETURN ROUND(GREATEST(LEAST(v_match, 100.00), 0.00), 2);
END$$
DELIMITER ;

-- ================================================================
-- 6. 被阻塞任务数量函数
--    返回指定任务被多少未完成的后续任务依赖
-- ================================================================
DELIMITER $$
CREATE FUNCTION fn_get_blocker_count(p_task_id INT)
RETURNS INT
DETERMINISTIC
BEGIN
  DECLARE v_count INT DEFAULT 0;

  SELECT COUNT(*) INTO v_count
  FROM t_task_dependency td
  JOIN t_task t ON td.task_id = t.task_id
  WHERE td.depends_on_id = p_task_id
    AND t.status IN ('pending', 'in_progress', 'blocked');

  RETURN v_count;
END$$
DELIMITER ;
