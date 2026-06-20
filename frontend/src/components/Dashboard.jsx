import React, { useEffect, useState } from 'react';
import { api } from '../api';

export default function Dashboard({ userId }) {
  const [stats, setStats] = useState(null);
  const [ranking, setRanking] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getDashboardStats(userId), api.getRanking(userId)])
      .then(([s, r]) => { setStats(s); setRanking(r); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) return <div className="loading">加载中...</div>;

  const sc = {};
  (stats?.status_counts || []).forEach(s => { sc[s.status] = s.count; });

  return (
    <div className="dashboard">
      <h2>总览</h2>
      <div className="stat-cards">
        <div className="stat-card">
          <div className="stat-number">{stats.total_tasks}</div>
          <div className="stat-label">全部任务</div>
        </div>
        <div className="stat-card accent-green">
          <div className="stat-number">{sc.completed || 0}</div>
          <div className="stat-label">已完成</div>
        </div>
        <div className="stat-card accent-blue">
          <div className="stat-number">{sc.pending || 0}</div>
          <div className="stat-label">待处理</div>
        </div>
        <div className="stat-card accent-orange">
          <div className="stat-number">{sc.in_progress || 0}</div>
          <div className="stat-label">进行中</div>
        </div>
        <div className="stat-card accent-red">
          <div className="stat-number">{stats.overdue_count}</div>
          <div className="stat-label">已逾期</div>
        </div>
        <div className="stat-card accent-purple">
          <div className="stat-number">{Number(stats.completion_rate || 0).toFixed(0)}%</div>
          <div className="stat-label">完成率</div>
        </div>
      </div>

      <div className="panel">
        <h3>优先级排名</h3>
        {ranking.length === 0 ? (
          <div className="empty">还没有数据</div>
        ) : (
          <div className="ranking-list">
            {ranking.map((item, idx) => {
              const score = Number(item.total_score || 0);
              return (
                <div key={item.task_id} className="ranking-item">
                  <span className="rank-badge" data-rank={idx + 1}>#{idx + 1}</span>
                  <span className="rank-title">{item.title}</span>
                  <span className="rank-score">{score.toFixed(1)}</span>
                  <div className="score-bar"><div className="score-fill" style={{ width: `${score}%` }} /></div>
                  <div className="score-details">
                    <span>紧迫 {Number(item.urgency || 0).toFixed(0)}</span>
                    <span>重要 {Number(item.importance || 0).toFixed(0)}</span>
                    <span>依赖 {Number(item.dependency || 0).toFixed(0)}</span>
                    <span>精力 {Number(item.energy || 0).toFixed(0)}</span>
                    <span>历史 {Number(item.history_prob || 0).toFixed(0)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {(stats.eisenhower || []).length > 0 && (
        <div className="panel">
          <h3>四象限分布</h3>
          <div className="eisenhower-grid">
            {stats.eisenhower.map(e => (
              <div key={e.eisenhower_quadrant} className="eisenhower-item" style={{ borderColor: e.color }}>
                <span className="eisenhower-name">{e.quadrant_name}</span>
                <span className="eisenhower-count">{e.task_count}个</span>
                {e.avg_score && <span className="eisenhower-score">均分 {Number(e.avg_score).toFixed(1)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {(stats.efficiency || []).length > 0 && (
        <div className="panel">
          <h3>分类效率统计</h3>
          <div className="efficiency-list">
            {stats.efficiency.map((e, i) => (
              <div key={i} className="efficiency-item">
                <span className="eff-cat">{e.category_name || '未分类'}</span>
                <span className="eff-stat">完成 {e.total_completed}个</span>
                <span className="eff-stat">按时率 {Number(e.on_time_rate || 0).toFixed(0)}%</span>
                <span className="eff-stat">平均延期 {Number(e.avg_delay_days || 0).toFixed(1)}天</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <h3>操作记录</h3>
        <div className="log-list">
          {(stats.recent_logs || []).length === 0 ? (
            <div className="empty">暂无记录</div>
          ) : (
            stats.recent_logs.map((log, i) => (
              <div key={i} className="log-item">
                <span className="log-type">{log.action_type}</span>
                <span className="log-time">{new Date(log.created_at).toLocaleString('zh-CN')}</span>
                <span className="log-detail">{log.action_detail ? JSON.stringify(log.action_detail) : ''}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
