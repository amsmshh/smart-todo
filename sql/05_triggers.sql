-- ================================================================
-- 智能待办事项优先级排序器 - 触发器
-- ================================================================

USE smart_todo;

-- ================================================================
-- 1. 任务完成触发器 (AFTER UPDATE)
--    当任务状态变为completed时自动处理
-- ================================================================
DELIMITER $$
CREATE TRIGGER trg_task_complete
AFTER UPDATE ON t_task
FOR EACH ROW
BEGIN
  DECLARE v_actual DECIMAL(5,1);

  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN

    -- 计算实际工时(若未手动填写)
    SET v_actual = NEW.actual_hours;
    IF v_actual IS NULL THEN
      SET v_actual = TIMESTAMPDIFF(SECOND, NEW.created_at, NOW()) / 3600.0;
    END IF;

    -- 插入完成历史
    INSERT INTO t_completion_history (user_id, task_id, category_id, priority_level,
                                       planned_hours, actual_hours, delay_days, completed_at)
    VALUES (
      NEW.assignee_id,
      NEW.task_id,
      NEW.category_id,
      NEW.priority_level,
      NEW.estimated_hours,
      v_actual,
      CASE
        WHEN NEW.deadline IS NOT NULL THEN
          GREATEST(DATEDIFF(NOW(), NEW.deadline), -365)
        ELSE 0
      END,
      NOW()
    );

    -- 插入行为日志
    INSERT INTO t_behavior_log (user_id, task_id, action_type, action_detail)
    VALUES (NEW.assignee_id, NEW.task_id, 'complete',
      JSON_OBJECT('actual_hours', v_actual, 'delay_days',
        CASE WHEN NEW.deadline IS NOT NULL THEN DATEDIFF(NOW(), NEW.deadline) ELSE 0 END));

    -- 更新精力画像
    CALL sp_update_energy_profile(NEW.assignee_id, v_actual, NEW.estimated_hours);

  END IF;
END$$
DELIMITER ;

-- ================================================================
-- 2. 任务创建日志触发器 (AFTER INSERT)
-- ================================================================
DELIMITER $$
CREATE TRIGGER trg_task_insert_log
AFTER INSERT ON t_task
FOR EACH ROW
BEGIN
  INSERT INTO t_behavior_log (user_id, task_id, action_type, action_detail)
  VALUES (NEW.assignee_id, NEW.task_id, 'create',
    JSON_OBJECT(
      'title', NEW.title,
      'priority', NEW.priority_level,
      'deadline', COALESCE(DATE_FORMAT(NEW.deadline, '%Y-%m-%d %H:%i'), 'none'),
      'project_id', COALESCE(NEW.project_id, 0),
      'category_id', COALESCE(NEW.category_id, 0)
    ));
END$$
DELIMITER ;

-- ================================================================
-- 3. 任务更新日志触发器 (AFTER UPDATE)
--    记录关键字段变更
-- ================================================================
DELIMITER $$
CREATE TRIGGER trg_task_update_log
AFTER UPDATE ON t_task
FOR EACH ROW
BEGIN
  DECLARE v_changes TEXT DEFAULT '';

  IF OLD.status != NEW.status THEN
    SET v_changes = CONCAT(v_changes, 'status:', OLD.status, '->', NEW.status, '; ');
  END IF;

  IF OLD.priority_level != NEW.priority_level THEN
    SET v_changes = CONCAT(v_changes, 'priority:', OLD.priority_level, '->', NEW.priority_level, '; ');
  END IF;

  IF COALESCE(OLD.deadline, '2000-01-01') != COALESCE(NEW.deadline, '2000-01-01') THEN
    SET v_changes = CONCAT(v_changes, 'deadline_changed; ');
  END IF;

  IF OLD.title != NEW.title THEN
    SET v_changes = CONCAT(v_changes, 'title_changed; ');
  END IF;

  IF OLD.project_id != NEW.project_id THEN
    SET v_changes = CONCAT(v_changes, 'project_changed; ');
  END IF;

  -- 仅在有变更时记录日志
  IF v_changes != '' THEN
    INSERT INTO t_behavior_log (user_id, task_id, action_type, action_detail)
    VALUES (NEW.assignee_id, NEW.task_id, 'update',
      JSON_OBJECT('changes', v_changes));
  END IF;
END$$
DELIMITER ;

-- ================================================================
-- 4. 防止自依赖触发器 (BEFORE INSERT)
-- ================================================================
DELIMITER $$
CREATE TRIGGER trg_prevent_self_dep
BEFORE INSERT ON t_task_dependency
FOR EACH ROW
BEGIN
  IF NEW.task_id = NEW.depends_on_id THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = '任务不能依赖自身';
  END IF;
END$$
DELIMITER ;

-- ================================================================
-- 5. 依赖状态检查触发器 (AFTER INSERT on t_task_dependency)
--    添加依赖时检查是否需要阻塞后续任务
-- ================================================================
DELIMITER $$
CREATE TRIGGER trg_dep_check_block
AFTER INSERT ON t_task_dependency
FOR EACH ROW
BEGIN
  DECLARE v_pre_status VARCHAR(20);

  SELECT status INTO v_pre_status
  FROM t_task WHERE task_id = NEW.depends_on_id;

  -- 前置任务未完成后，阻塞后续任务
  IF v_pre_status != 'completed' THEN
    UPDATE t_task
    SET status = 'blocked'
    WHERE task_id = NEW.task_id
      AND status = 'pending';
  END IF;
END$$
DELIMITER ;
