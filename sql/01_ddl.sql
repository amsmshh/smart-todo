-- ================================================================
-- 智能待办事项优先级排序器 - 数据库DDL脚本
-- 数据库: MySQL 8.0+
-- ================================================================

SET NAMES utf8mb4;
SET CHARACTER_SET_CLIENT = utf8mb4;
SET CHARACTER_SET_RESULTS = utf8mb4;
SET CHARACTER_SET_CONNECTION = utf8mb4;

-- 创建数据库
DROP DATABASE IF EXISTS smart_todo;
CREATE DATABASE smart_todo
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE smart_todo;

-- ================================================================
-- 1. 用户表
-- ================================================================
CREATE TABLE t_user (
  user_id       INT           PRIMARY KEY AUTO_INCREMENT,
  username      VARCHAR(50)   NOT NULL UNIQUE COMMENT '用户名',
  password_hash VARCHAR(255)  NOT NULL COMMENT '密码SHA-256哈希',
  email         VARCHAR(100)  NOT NULL UNIQUE COMMENT '电子邮箱',
  avatar_url    VARCHAR(255)  DEFAULT NULL COMMENT '头像URL',
  register_time DATETIME      NOT NULL DEFAULT NOW() COMMENT '注册时间',
  last_login    DATETIME      DEFAULT NULL COMMENT '最后登录时间',
  status        TINYINT       NOT NULL DEFAULT 1 COMMENT '0禁用 1正常 2冻结',
  CONSTRAINT chk_user_status CHECK (status IN (0, 1, 2))
) ENGINE=InnoDB COMMENT='用户表';

-- ================================================================
-- 2. 项目表
-- ================================================================
CREATE TABLE t_project (
  project_id    INT           PRIMARY KEY AUTO_INCREMENT,
  project_name  VARCHAR(100)  NOT NULL COMMENT '项目名称',
  description   TEXT          DEFAULT NULL COMMENT '项目描述',
  creator_id    INT           NOT NULL COMMENT '创建者ID',
  color         VARCHAR(7)    DEFAULT '#3498db' COMMENT '项目颜色',
  created_at    DATETIME      NOT NULL DEFAULT NOW() COMMENT '创建时间',
  status        TINYINT       NOT NULL DEFAULT 1 COMMENT '0归档 1进行中',
  CONSTRAINT fk_project_creator FOREIGN KEY (creator_id) REFERENCES t_user(user_id) ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='项目表';

-- ================================================================
-- 3. 分类表
-- ================================================================
CREATE TABLE t_category (
  category_id   INT           PRIMARY KEY AUTO_INCREMENT,
  category_name VARCHAR(50)   NOT NULL UNIQUE COMMENT '分类名称',
  description   VARCHAR(200)  DEFAULT NULL COMMENT '分类描述',
  icon          VARCHAR(50)   DEFAULT NULL COMMENT '图标标识',
  color         VARCHAR(7)    DEFAULT '#95a5a6' COMMENT '分类颜色',
  created_at    DATETIME      NOT NULL DEFAULT NOW() COMMENT '创建时间'
) ENGINE=InnoDB COMMENT='分类表';

-- ================================================================
-- 4. 任务表 (核心)
-- ================================================================
CREATE TABLE t_task (
  task_id             INT           PRIMARY KEY AUTO_INCREMENT,
  title               VARCHAR(200)  NOT NULL COMMENT '任务标题',
  description         TEXT          DEFAULT NULL COMMENT '任务描述',
  status              ENUM('pending','in_progress','completed','cancelled','blocked')
                                    NOT NULL DEFAULT 'pending' COMMENT '任务状态',
  priority_level      TINYINT       NOT NULL DEFAULT 3 COMMENT '基础优先级1-5(1最高)',
  sort_order          INT           NOT NULL DEFAULT 0 COMMENT '拖拽排序序号',
  deadline            DATETIME      DEFAULT NULL COMMENT '截止时间',
  estimated_hours     DECIMAL(5,1)  DEFAULT NULL COMMENT '预估工时(小时)',
  actual_hours        DECIMAL(5,1)  DEFAULT NULL COMMENT '实际工时(小时)',
  project_id          INT           DEFAULT NULL COMMENT '所属项目ID',
  category_id         INT           DEFAULT NULL COMMENT '所属分类ID',
  assignee_id         INT           NOT NULL COMMENT '执行者ID',
  eisenhower_quadrant TINYINT       DEFAULT NULL COMMENT '艾森豪威尔象限1-4',
  created_at          DATETIME      NOT NULL DEFAULT NOW() COMMENT '创建时间',
  completed_at        DATETIME      DEFAULT NULL COMMENT '完成时间',
  updated_at          DATETIME      NOT NULL DEFAULT NOW() ON UPDATE NOW() COMMENT '更新时间',
  CONSTRAINT chk_priority CHECK (priority_level BETWEEN 1 AND 5),
  CONSTRAINT chk_quadrant CHECK (eisenhower_quadrant IS NULL OR eisenhower_quadrant BETWEEN 1 AND 4),
  CONSTRAINT chk_estimated CHECK (estimated_hours IS NULL OR estimated_hours > 0),
  CONSTRAINT fk_task_project  FOREIGN KEY (project_id)  REFERENCES t_project(project_id)  ON DELETE SET NULL,
  CONSTRAINT fk_task_category FOREIGN KEY (category_id) REFERENCES t_category(category_id) ON DELETE SET NULL,
  CONSTRAINT fk_task_assignee FOREIGN KEY (assignee_id) REFERENCES t_user(user_id)          ON DELETE RESTRICT
) ENGINE=InnoDB COMMENT='任务表';

-- ================================================================
-- 5. 标签表
-- ================================================================
CREATE TABLE t_tag (
  tag_id      INT           PRIMARY KEY AUTO_INCREMENT,
  tag_name    VARCHAR(50)   NOT NULL UNIQUE COMMENT '标签名称',
  color       VARCHAR(7)    DEFAULT '#e74c3c' COMMENT '标签颜色',
  created_at  DATETIME      NOT NULL DEFAULT NOW() COMMENT '创建时间'
) ENGINE=InnoDB COMMENT='标签表';

-- ================================================================
-- 6. 任务-标签关联表
-- ================================================================
CREATE TABLE t_task_tag (
  id        INT PRIMARY KEY AUTO_INCREMENT,
  task_id   INT NOT NULL COMMENT '任务ID',
  tag_id    INT NOT NULL COMMENT '标签ID',
  CONSTRAINT uq_task_tag UNIQUE (task_id, tag_id),
  CONSTRAINT fk_tt_task FOREIGN KEY (task_id) REFERENCES t_task(task_id) ON DELETE CASCADE,
  CONSTRAINT fk_tt_tag  FOREIGN KEY (tag_id)  REFERENCES t_tag(tag_id)   ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='任务标签关联表';

-- ================================================================
-- 7. 任务依赖关系表
-- ================================================================
CREATE TABLE t_task_dependency (
  dep_id        INT           PRIMARY KEY AUTO_INCREMENT,
  task_id       INT           NOT NULL COMMENT '后续任务ID',
  depends_on_id INT           NOT NULL COMMENT '前置任务ID',
  dep_type      ENUM('FS','SS') NOT NULL DEFAULT 'FS' COMMENT 'FS完成-开始 SS开始-开始',
  created_at    DATETIME      NOT NULL DEFAULT NOW() COMMENT '创建时间',
  CONSTRAINT uq_dep UNIQUE (task_id, depends_on_id),
  CONSTRAINT fk_dep_task      FOREIGN KEY (task_id)       REFERENCES t_task(task_id) ON DELETE CASCADE,
  CONSTRAINT fk_dep_depends   FOREIGN KEY (depends_on_id) REFERENCES t_task(task_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='任务依赖关系表';

-- ================================================================
-- 8. 艾森豪威尔矩阵配置表
-- ================================================================
CREATE TABLE t_eisenhower_matrix (
  matrix_id       INT           PRIMARY KEY AUTO_INCREMENT,
  quadrant        TINYINT       NOT NULL UNIQUE COMMENT '象限编号1-4',
  name            VARCHAR(50)   NOT NULL COMMENT '象限名称',
  action_strategy VARCHAR(100)  NOT NULL COMMENT '处理策略',
  color           VARCHAR(7)    NOT NULL COMMENT '颜色标识',
  sort_weight     DECIMAL(3,2)  NOT NULL COMMENT '排序权重',
  CONSTRAINT chk_eq_quad CHECK (quadrant BETWEEN 1 AND 4)
) ENGINE=InnoDB COMMENT='艾森豪威尔矩阵配置表';

-- ================================================================
-- 9. 优先级规则表
-- ================================================================
CREATE TABLE t_priority_rule (
  rule_id         INT           PRIMARY KEY AUTO_INCREMENT,
  rule_name       VARCHAR(50)   NOT NULL COMMENT '规则名称',
  user_id         INT           NOT NULL COMMENT '所属用户ID',
  w_urgency       DECIMAL(3,2)  NOT NULL DEFAULT 0.30 COMMENT '紧迫度权重',
  w_importance    DECIMAL(3,2)  NOT NULL DEFAULT 0.25 COMMENT '重要度权重',
  w_dependency    DECIMAL(3,2)  NOT NULL DEFAULT 0.20 COMMENT '依赖度权重',
  w_energy        DECIMAL(3,2)  NOT NULL DEFAULT 0.15 COMMENT '精力匹配权重',
  w_history       DECIMAL(3,2)  NOT NULL DEFAULT 0.10 COMMENT '历史概率权重',
  is_default      TINYINT       NOT NULL DEFAULT 0 COMMENT '是否默认规则',
  created_at      DATETIME      NOT NULL DEFAULT NOW() COMMENT '创建时间',
  CONSTRAINT fk_rule_user FOREIGN KEY (user_id) REFERENCES t_user(user_id) ON DELETE CASCADE,
  CONSTRAINT chk_weights CHECK (
    w_urgency + w_importance + w_dependency + w_energy + w_history BETWEEN 0.99 AND 1.01
  )
) ENGINE=InnoDB COMMENT='优先级规则表';

-- ================================================================
-- 10. 智能评分记录表
-- ================================================================
CREATE TABLE t_smart_score (
  score_id          INT           PRIMARY KEY AUTO_INCREMENT,
  task_id           INT           NOT NULL COMMENT '任务ID',
  urgency_score     DECIMAL(5,2)  NOT NULL COMMENT '紧迫度得分0-100',
  importance_score  DECIMAL(5,2)  NOT NULL COMMENT '重要度得分0-100',
  dependency_score  DECIMAL(5,2)  NOT NULL COMMENT '依赖度得分0-100',
  energy_score      DECIMAL(5,2)  NOT NULL COMMENT '精力匹配得分0-100',
  history_score     DECIMAL(5,2)  NOT NULL COMMENT '历史概率得分0-100',
  total_score       DECIMAL(5,2)  NOT NULL COMMENT '加权综合得分',
  rule_id           INT           DEFAULT NULL COMMENT '使用的规则ID',
  scored_at         DATETIME      NOT NULL DEFAULT NOW() COMMENT '评分时间',
  CONSTRAINT fk_score_task FOREIGN KEY (task_id) REFERENCES t_task(task_id) ON DELETE CASCADE,
  CONSTRAINT fk_score_rule FOREIGN KEY (rule_id) REFERENCES t_priority_rule(rule_id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='智能评分记录表';

-- ================================================================
-- 11. 用户行为日志表
-- ================================================================
CREATE TABLE t_behavior_log (
  log_id        BIGINT        PRIMARY KEY AUTO_INCREMENT,
  user_id       INT           NOT NULL COMMENT '操作用户ID',
  task_id       INT           DEFAULT NULL COMMENT '关联任务ID',
  action_type   VARCHAR(30)   NOT NULL COMMENT '操作类型',
  action_detail JSON          DEFAULT NULL COMMENT '操作详情',
  ip_address    VARCHAR(45)   DEFAULT NULL COMMENT 'IP地址',
  created_at    DATETIME      NOT NULL DEFAULT NOW() COMMENT '操作时间',
  CONSTRAINT fk_blog_user FOREIGN KEY (user_id) REFERENCES t_user(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_blog_task FOREIGN KEY (task_id) REFERENCES t_task(task_id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='用户行为日志表';

-- ================================================================
-- 12. 任务完成历史表
-- ================================================================
CREATE TABLE t_completion_history (
  history_id      INT           PRIMARY KEY AUTO_INCREMENT,
  user_id         INT           NOT NULL COMMENT '用户ID',
  task_id         INT           NOT NULL COMMENT '任务ID',
  category_id     INT           DEFAULT NULL COMMENT '分类ID',
  priority_level  TINYINT       NOT NULL COMMENT '原优先级',
  planned_hours   DECIMAL(5,1)  DEFAULT NULL COMMENT '计划工时',
  actual_hours    DECIMAL(5,1)  DEFAULT NULL COMMENT '实际工时',
  delay_days      INT           DEFAULT 0 COMMENT '延期天数(负数提前)',
  completed_at    DATETIME      NOT NULL COMMENT '完成时间',
  CONSTRAINT fk_ch_user FOREIGN KEY (user_id) REFERENCES t_user(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_ch_task FOREIGN KEY (task_id) REFERENCES t_task(task_id) ON DELETE CASCADE,
  CONSTRAINT fk_ch_cat  FOREIGN KEY (category_id) REFERENCES t_category(category_id) ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='任务完成历史表';

-- ================================================================
-- 13. 用户偏好设置表
-- ================================================================
CREATE TABLE t_user_preference (
  pref_id     INT           PRIMARY KEY AUTO_INCREMENT,
  user_id     INT           NOT NULL COMMENT '用户ID',
  pref_key    VARCHAR(50)   NOT NULL COMMENT '偏好键名',
  pref_value  TEXT          NOT NULL COMMENT '偏好值',
  updated_at  DATETIME      NOT NULL DEFAULT NOW() ON UPDATE NOW() COMMENT '更新时间',
  CONSTRAINT uq_pref UNIQUE (user_id, pref_key),
  CONSTRAINT fk_pref_user FOREIGN KEY (user_id) REFERENCES t_user(user_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='用户偏好设置表';

-- ================================================================
-- 14. 用户精力画像表
-- ================================================================
CREATE TABLE t_energy_profile (
  profile_id    INT           PRIMARY KEY AUTO_INCREMENT,
  user_id       INT           NOT NULL COMMENT '用户ID',
  day_of_week   TINYINT       NOT NULL COMMENT '星期1-7',
  hour_slot     TINYINT       NOT NULL COMMENT '小时0-23',
  energy_level  DECIMAL(3,2)  NOT NULL COMMENT '精力水平0-1',
  sample_count  INT           NOT NULL DEFAULT 0 COMMENT '采样次数',
  updated_at    DATETIME      NOT NULL DEFAULT NOW() ON UPDATE NOW() COMMENT '更新时间',
  CONSTRAINT uq_energy UNIQUE (user_id, day_of_week, hour_slot),
  CONSTRAINT chk_day CHECK (day_of_week BETWEEN 1 AND 7),
  CONSTRAINT chk_hour CHECK (hour_slot BETWEEN 0 AND 23),
  CONSTRAINT chk_energy CHECK (energy_level BETWEEN 0 AND 1),
  CONSTRAINT fk_energy_user FOREIGN KEY (user_id) REFERENCES t_user(user_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='用户精力画像表';

-- ================================================================
-- 15. 时间上下文表
-- ================================================================
CREATE TABLE t_time_context (
  context_id    INT           PRIMARY KEY AUTO_INCREMENT,
  user_id       INT           NOT NULL COMMENT '用户ID',
  context_type  VARCHAR(20)   NOT NULL COMMENT '上下文类型:work/rest/focus等',
  start_time    TIME          NOT NULL COMMENT '开始时间',
  end_time      TIME          NOT NULL COMMENT '结束时间',
  label         VARCHAR(50)   DEFAULT NULL COMMENT '自定义标签',
  created_at    DATETIME      NOT NULL DEFAULT NOW() COMMENT '创建时间',
  CONSTRAINT fk_tc_user FOREIGN KEY (user_id) REFERENCES t_user(user_id) ON DELETE CASCADE
) ENGINE=InnoDB COMMENT='时间上下文表';
