-- ================================================================
-- 智能待办事项优先级排序器 - 索引
-- ================================================================

USE smart_todo;

-- 任务表：按状态、执行者、截止时间筛选
CREATE INDEX idx_task_status     ON t_task (status);
CREATE INDEX idx_task_assignee   ON t_task (assignee_id);
CREATE INDEX idx_task_deadline   ON t_task (deadline);

-- 评分表：按任务查最新评分
CREATE INDEX idx_score_task      ON t_smart_score (task_id, scored_at);

-- 行为日志：按用户查最近操作
CREATE INDEX idx_behavior_user   ON t_behavior_log (user_id, created_at);

-- 精力画像：按时段查精力值
CREATE INDEX idx_energy_lookup   ON t_energy_profile (user_id, day_of_week, hour_slot);

-- 依赖表：按任务查前后置关系
CREATE INDEX idx_dep_task        ON t_task_dependency (task_id);
