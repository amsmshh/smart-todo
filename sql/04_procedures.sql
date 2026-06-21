-- ================================================================
-- 智能待办事项优先级排序器 - 存储过程
-- ================================================================

USE smart_todo;

-- ================================================================
-- 1. 智能评分计算存储过程 (核心)
--    输入: 任务ID, 规则ID(可选)
--    输出: 综合得分及各维度得分
-- ================================================================
DELIMITER $$
CREATE PROCEDURE sp_calculate_smart_score(
  IN  p_task_id    INT,
  IN  p_rule_id    INT,       -- NULL则使用默认规则
  OUT p_total      DECIMAL(5,2)
)
BEGIN
  DECLARE v_urgency     DECIMAL(5,2);
  DECLARE v_importance  DECIMAL(5,2);
  DECLARE v_dependency  DECIMAL(5,2);
  DECLARE v_energy      DECIMAL(5,2);
  DECLARE v_history     DECIMAL(5,2);
  DECLARE v_w_urgency   DECIMAL(3,2);
  DECLARE v_w_importance DECIMAL(3,2);
  DECLARE v_w_dependency DECIMAL(3,2);
  DECLARE v_w_energy     DECIMAL(3,2);
  DECLARE v_w_history    DECIMAL(3,2);
  DECLARE v_priority     TINYINT;
  DECLARE v_project_id   INT;
  DECLARE v_category_id  INT;
  DECLARE v_assignee_id  INT;
  DECLARE v_deadline     DATETIME;
  DECLARE v_dep_depth    INT;
  DECLARE v_rule_id      INT;

  -- 获取任务信息
  SELECT priority_level, project_id, category_id, assignee_id, deadline
  INTO v_priority, v_project_id, v_category_id, v_assignee_id, v_deadline
  FROM t_task WHERE task_id = p_task_id;

  -- 确定使用的规则
  IF p_rule_id IS NOT NULL THEN
    SET v_rule_id = p_rule_id;
  ELSE
    SELECT rule_id INTO v_rule_id
    FROM t_priority_rule
    WHERE user_id = v_assignee_id AND is_default = 1
    LIMIT 1;
    IF v_rule_id IS NULL THEN
      SET v_rule_id = 1; -- fallback
    END IF;
  END IF;

  -- 获取权重
  SELECT w_urgency, w_importance, w_dependency, w_energy, w_history
  INTO v_w_urgency, v_w_importance, v_w_dependency, v_w_energy, v_w_history
  FROM t_priority_rule WHERE rule_id = v_rule_id;

  -- 计算各维度得分
  SET v_urgency    = fn_calc_urgency(v_deadline);
  SET v_importance = fn_calc_importance(v_priority, v_project_id);
  SET v_dep_depth  = fn_get_dep_depth(p_task_id);
  SET v_dependency = LEAST(v_dep_depth * 25.0, 100.0); -- 每层深度25分，最高100
  SET v_energy     = fn_calc_energy_match(v_assignee_id, v_priority);
  SET v_history    = fn_get_completion_rate(v_assignee_id, v_category_id, v_priority);

  -- 加权综合得分
  SET p_total = ROUND(
    v_urgency    * v_w_urgency +
    v_importance * v_w_importance +
    v_dependency * v_w_dependency +
    v_energy     * v_w_energy +
    v_history    * v_w_history,
  2);

  -- 插入评分记录
  INSERT INTO t_smart_score (task_id, urgency_score, importance_score, dependency_score,
                              energy_score, history_score, total_score, rule_id)
  VALUES (p_task_id, v_urgency, v_importance, v_dependency, v_energy, v_history, p_total, v_rule_id);
END$$
DELIMITER ;

-- ================================================================
-- 2. 批量刷新评分存储过程
--    遍历所有待办任务，逐个调用评分计算
-- ================================================================
DELIMITER $$
CREATE PROCEDURE sp_refresh_all_scores()
BEGIN
  DECLARE v_task_id INT;
  DECLARE v_total   DECIMAL(5,2);
  DECLARE v_done    INT DEFAULT 0;

  DECLARE cur_tasks CURSOR FOR
    SELECT task_id FROM t_task WHERE status IN ('pending', 'in_progress');
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

  OPEN cur_tasks;

  loop_tasks: LOOP
    FETCH cur_tasks INTO v_task_id;
    IF v_done THEN
      LEAVE loop_tasks;
    END IF;

    CALL sp_calculate_smart_score(v_task_id, NULL, v_total);
  END LOOP;

  CLOSE cur_tasks;
END$$
DELIMITER ;

-- ================================================================
-- 3. 艾森豪威尔矩阵自动归类存储过程
--    根据截止时间和重要程度自动分配象限
-- ================================================================
DELIMITER $$
CREATE PROCEDURE sp_classify_eisenhower(IN p_user_id INT)
BEGIN
  -- 象限1: 紧急且重要 (deadline <= 24h AND priority <= 2)
  UPDATE t_task
  SET eisenhower_quadrant = 1
  WHERE assignee_id = p_user_id
    AND status IN ('pending', 'in_progress')
    AND deadline IS NOT NULL
    AND deadline <= DATE_ADD(NOW(), INTERVAL 24 HOUR)
    AND priority_level <= 2;

  -- 象限2: 重要不紧急 (deadline > 72h AND priority <= 2)
  UPDATE t_task
  SET eisenhower_quadrant = 2
  WHERE assignee_id = p_user_id
    AND status IN ('pending', 'in_progress')
    AND eisenhower_quadrant IS NULL
    AND (deadline IS NULL OR deadline > DATE_ADD(NOW(), INTERVAL 72 HOUR))
    AND priority_level <= 2;

  -- 象限3: 紧急不重要 (deadline <= 24h AND priority >= 3)
  UPDATE t_task
  SET eisenhower_quadrant = 3
  WHERE assignee_id = p_user_id
    AND status IN ('pending', 'in_progress')
    AND eisenhower_quadrant IS NULL
    AND deadline IS NOT NULL
    AND deadline <= DATE_ADD(NOW(), INTERVAL 24 HOUR)
    AND priority_level >= 3;

  -- 象限4: 其余全部归入不紧急不重要
  UPDATE t_task
  SET eisenhower_quadrant = 4
  WHERE assignee_id = p_user_id
    AND status IN ('pending', 'in_progress')
    AND eisenhower_quadrant IS NULL;

  -- 中间地带: 不满足以上严格条件的归入象限2
  UPDATE t_task
  SET eisenhower_quadrant = 2
  WHERE assignee_id = p_user_id
    AND status IN ('pending', 'in_progress')
    AND eisenhower_quadrant IS NULL
    AND priority_level <= 3;
END$$
DELIMITER ;

-- ================================================================
-- 4. 任务依赖添加存储过程 (含循环检测)
--    使用递归CTE检测循环依赖
-- ================================================================
DELIMITER $$
CREATE PROCEDURE sp_add_task_dependency(
  IN p_task_id       INT,
  IN p_depends_on_id INT,
  IN p_dep_type      VARCHAR(2),
  OUT p_result       VARCHAR(100)
)
BEGIN
  DECLARE v_cycle INT DEFAULT 0;

  -- 自依赖检查
  IF p_task_id = p_depends_on_id THEN
    SET p_result = '错误: 任务不能依赖自身';
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '任务不能依赖自身';
  END IF;

  -- 检查是否已存在此依赖
  IF EXISTS (SELECT 1 FROM t_task_dependency WHERE task_id = p_task_id AND depends_on_id = p_depends_on_id) THEN
    SET p_result = '错误: 依赖关系已存在';
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '依赖关系已存在';
  END IF;

  -- 循环依赖检测: 从depends_on_id出发递归查找，如果找到task_id则形成循环
  WITH RECURSIVE dep_check AS (
    -- 锚点
    SELECT depends_on_id, 1 AS depth
    FROM t_task_dependency
    WHERE task_id = p_depends_on_id

    UNION ALL

    -- 递归
    SELECT td.depends_on_id, dc.depth + 1
    FROM t_task_dependency td
    JOIN dep_check dc ON td.task_id = dc.depends_on_id
    WHERE dc.depth < 50
  )
  SELECT COUNT(*) INTO v_cycle
  FROM dep_check
  WHERE depends_on_id = p_task_id;

  IF v_cycle > 0 THEN
    SET p_result = '错误: 添加此依赖将形成循环';
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '检测到循环依赖';
  END IF;

  -- 添加依赖
  INSERT INTO t_task_dependency (task_id, depends_on_id, dep_type)
  VALUES (p_task_id, p_depends_on_id, COALESCE(p_dep_type, 'FS'));

  -- 检查前置任务是否已完成，未完成则阻塞后续任务
  IF NOT EXISTS (
    SELECT 1 FROM t_task WHERE task_id = p_depends_on_id AND status = 'completed'
  ) THEN
    UPDATE t_task SET status = 'blocked' WHERE task_id = p_task_id AND status = 'pending';
  END IF;

  SET p_result = '依赖关系添加成功';
END$$
DELIMITER ;

-- ================================================================
-- 5. 精力画像更新存储过程
--    基于加权移动平均更新精力水平
-- ================================================================
DELIMITER $$
CREATE PROCEDURE sp_update_energy_profile(
  IN p_user_id        INT,
  IN p_actual_hours   DECIMAL(5,1),
  IN p_planned_hours  DECIMAL(5,1)
)
BEGIN
  DECLARE v_day INT;
  DECLARE v_hour INT;
  DECLARE v_performance DECIMAL(3,2);
  DECLARE v_old_level DECIMAL(3,2) DEFAULT NULL;
  DECLARE v_old_count INT DEFAULT 0;
  DECLARE v_new_level DECIMAL(3,2);

  -- 处理无匹配记录的情况，不抛出错误
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_old_level = NULL;

  -- 转换星期: 1=周一, 2=周二, ..., 7=周日
  SET v_day = ((DAYOFWEEK(NOW()) + 5) % 7) + 1;
  SET v_hour = HOUR(NOW());

  -- 计算表现得分: 计划/实际 (越接近1越好，超过1说明提前完成)
  IF p_planned_hours IS NOT NULL AND p_actual_hours IS NOT NULL AND p_actual_hours > 0 THEN
    SET v_performance = LEAST(p_planned_hours / p_actual_hours, 1.5);
  ELSE
    SET v_performance = 0.7; -- 默认中等表现
  END IF;

  -- 查询现有记录
  SELECT energy_level, sample_count
  INTO v_old_level, v_old_count
  FROM t_energy_profile
  WHERE user_id = p_user_id AND day_of_week = v_day AND hour_slot = v_hour;

  IF v_old_level IS NULL THEN
    -- 首次记录，直接插入
    INSERT INTO t_energy_profile (user_id, day_of_week, hour_slot, energy_level, sample_count)
    VALUES (p_user_id, v_day, v_hour, v_performance, 1)
    ON DUPLICATE KEY UPDATE
      energy_level = v_performance,
      sample_count = 1;
  ELSE
    -- 加权移动平均: 新值权重 = 1/(count+1)
    SET v_new_level = (v_old_level * v_old_count + v_performance) / (v_old_count + 1);
    UPDATE t_energy_profile
    SET energy_level = v_new_level,
        sample_count = v_old_count + 1
    WHERE user_id = p_user_id AND day_of_week = v_day AND hour_slot = v_hour;
  END IF;
END$$
DELIMITER ;

-- ================================================================
-- 6. 获取排序后的任务列表 (核心查询过程)
--    返回按智能评分降序排列的任务列表
-- ================================================================
DELIMITER $$
CREATE PROCEDURE sp_get_sorted_tasks(
  IN p_user_id    INT,
  IN p_project_id INT,        -- NULL表示不限项目
  IN p_status     VARCHAR(20)  -- NULL表示不限状态
)
BEGIN
  SELECT
    t.task_id,
    t.title,
    t.status,
    t.priority_level,
    t.deadline,
    t.estimated_hours,
    t.eisenhower_quadrant,
    eq.name AS quadrant_name,
    p.project_name,
    c.category_name,
    COALESCE(s.total_score, 0) AS smart_score,
    COALESCE(s.urgency_score, 0) AS urgency,
    COALESCE(s.importance_score, 0) AS importance,
    COALESCE(s.dependency_score, 0) AS dependency,
    COALESCE(s.energy_score, 0) AS energy,
    COALESCE(s.history_score, 0) AS history_prob,
    fn_get_dep_depth(t.task_id) AS dep_depth,
    DENSE_RANK() OVER (ORDER BY COALESCE(s.total_score, 0) DESC) AS priority_rank
  FROM t_task t
  LEFT JOIN t_smart_score s ON t.task_id = s.task_id
    AND s.scored_at = (SELECT MAX(scored_at) FROM t_smart_score WHERE task_id = t.task_id)
  LEFT JOIN t_project p ON t.project_id = p.project_id
  LEFT JOIN t_category c ON t.category_id = c.category_id
  LEFT JOIN t_eisenhower_matrix eq ON t.eisenhower_quadrant = eq.quadrant
  WHERE t.assignee_id = p_user_id
    AND (p_project_id IS NULL OR t.project_id = p_project_id)
    AND (p_status IS NULL OR t.status = p_status)
  ORDER BY COALESCE(s.total_score, 0) DESC, t.deadline ASC;
END$$
DELIMITER ;

-- ================================================================
-- 7. 用户注册存储过程
-- ================================================================
DELIMITER $$
CREATE PROCEDURE sp_register_user(
  IN  p_username VARCHAR(50),
  IN  p_password VARCHAR(100),
  IN  p_email    VARCHAR(100),
  OUT p_result   VARCHAR(100)
)
BEGIN
  DECLARE v_count INT;
  DECLARE v_new_id INT;

  SELECT COUNT(*) INTO v_count FROM t_user WHERE username = p_username;
  IF v_count > 0 THEN
    SELECT '用户名已存在' AS result;
  ELSE
    SELECT COUNT(*) INTO v_count FROM t_user WHERE email = p_email;
    IF v_count > 0 THEN
      SELECT '邮箱已被注册' AS result;
    ELSE
      INSERT INTO t_user (username, password_hash, email)
      VALUES (p_username, SHA2(p_password, 256), p_email);

      SET v_new_id = LAST_INSERT_ID();

      -- 为新用户创建默认规则
      INSERT INTO t_priority_rule (rule_name, user_id, w_urgency, w_importance, w_dependency, w_energy, w_history, is_default)
      VALUES ('默认均衡规则', v_new_id, 0.30, 0.25, 0.20, 0.15, 0.10, 1);

      -- 初始化精力画像 (默认值)
      INSERT INTO t_energy_profile (user_id, day_of_week, hour_slot, energy_level, sample_count)
      SELECT v_new_id, d.d, h.h, 0.5, 0
      FROM (SELECT 1 AS d UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7) d
      CROSS JOIN (SELECT 9 AS h UNION SELECT 10 UNION SELECT 11 UNION SELECT 14 UNION SELECT 15 UNION SELECT 16) h;

      SELECT '注册成功' AS result;
    END IF;
  END IF;
END$$
DELIMITER ;
