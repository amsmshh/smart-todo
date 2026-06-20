import React, { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api';

const STATUS_MAP = {
  pending: { text: '待处理', color: '#60a5fa' },
  in_progress: { text: '进行中', color: '#fb923c' },
  completed: { text: '已完成', color: '#4ade80' },
  cancelled: { text: '已取消', color: '#5c5a70' },
  blocked: { text: '被阻塞', color: '#f87171' },
};

export default function TaskList({ userId, onRefresh, onTaskClick }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('active');
  const [projectFilter, setProjectFilter] = useState('');
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [dragId, setDragId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    const p = { user_id: userId };
    if (statusFilter && statusFilter !== 'active') p.status = statusFilter;
    if (projectFilter) p.project_id = projectFilter;
    if (search) p.search = search;
    api.getTasks(p).then(setTasks).catch(() => {}).finally(() => setLoading(false));
  }, [userId, statusFilter, projectFilter, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.getProjects().then(setProjects).catch(() => {}); }, []);

  const changeStatus = async (id, s) => {
    await api.updateTask(id, { status: s });
    load(); onRefresh?.();
  };

  const remove = async (id) => {
    if (!confirm('确定删除？')) return;
    await api.deleteTask(id);
    setSelected(s => { const n = new Set(s); n.delete(id); return n; });
    load(); onRefresh?.();
  };

  const refreshAll = async () => {
    setLoading(true);
    await api.refreshAllScores();
    load(); onRefresh?.();
  };

  // 批量操作
  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const selectAll = () => {
    if (selected.size === tasks.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(tasks.map(t => t.task_id)));
    }
  };

  const batchStatus = async (status) => {
    const ids = [...selected];
    await api.batchStatus(ids, status);
    setSelected(new Set());
    load(); onRefresh?.();
  };

  const batchDelete = async () => {
    if (!confirm(`确定删除${selected.size}个任务？`)) return;
    const ids = [...selected];
    await api.batchDelete(ids);
    setSelected(new Set());
    load(); onRefresh?.();
  };

  // 拖拽排序
  const onDragStart = (e, id) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e, id) => {
    e.preventDefault();
    if (id !== dragOverId) setDragOverId(id);
  };

  const onDragEnd = () => {
    if (dragId && dragOverId && dragId !== dragOverId) {
      const arr = [...tasks];
      const fromIdx = arr.findIndex(t => t.task_id === dragId);
      const toIdx = arr.findIndex(t => t.task_id === dragOverId);
      if (fromIdx !== -1 && toIdx !== -1) {
        const [moved] = arr.splice(fromIdx, 1);
        arr.splice(toIdx, 0, moved);
        setTasks(arr);
        // 保存排序到后端
        const orders = arr.map((t, i) => ({ task_id: t.task_id, sort_order: i + 1 }));
        api.reorderTasks(orders).catch(() => {});
      }
    }
    setDragId(null);
    setDragOverId(null);
  };

  const N = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };

  return (
    <div className="task-list-page">
      <div className="task-toolbar">
        <h2>任务列表</h2>
        <div className="toolbar-actions">
          <input className="search-input" placeholder="搜索任务..." value={search}
            onChange={e => setSearch(e.target.value)} />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="active">待完成</option>
            <option value="">全部</option>
            <option value="pending">待处理</option>
            <option value="in_progress">进行中</option>
            <option value="completed">已完成</option>
            <option value="cancelled">已取消</option>
            <option value="blocked">被阻塞</option>
          </select>
          <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}>
            <option value="">所有项目</option>
            {projects.map(p => <option key={p.project_id} value={p.project_id}>{p.project_name}</option>)}
          </select>
          <button className="btn btn-primary" onClick={refreshAll}>重新评分</button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="batch-bar">
          <span>已选 {selected.size} 项</span>
          <button className="btn btn-sm" onClick={selectAll}>{selected.size === tasks.length ? '取消全选' : '全选'}</button>
          <button className="btn btn-sm btn-start" onClick={() => batchStatus('in_progress')}>批量开始</button>
          <button className="btn btn-sm btn-complete" onClick={() => batchStatus('completed')}>批量完成</button>
          <button className="btn btn-sm btn-danger" onClick={batchDelete}>批量删除</button>
          <button className="btn btn-sm" onClick={() => setSelected(new Set())}>取消选择</button>
        </div>
      )}

      {loading ? <div className="loading">加载中...</div> : (
        <div className="task-cards">
          {tasks.length === 0 && <div className="empty">还没有任务</div>}
          {tasks.map(t => {
            const score = N(t.smart_score);
            const st = STATUS_MAP[t.status] || STATUS_MAP.pending;
            const isDragging = dragId === t.task_id;
            const isDragOver = dragOverId === t.task_id && dragId !== t.task_id;
            return (
              <div key={t.task_id}
                className={`task-card ${t.status} ${isDragging ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
                draggable
                onDragStart={e => onDragStart(e, t.task_id)}
                onDragOver={e => onDragOver(e, t.task_id)}
                onDragEnd={onDragEnd}
                onClick={() => onTaskClick?.(t.task_id)}>
                <div className="task-card-header">
                  <input type="checkbox" className="task-checkbox" checked={selected.has(t.task_id)}
                    onClick={e => e.stopPropagation()}
                    onChange={e => toggleSelect(t.task_id, e)} />
                  <span className="task-rank">#{t.priority_rank || '-'}</span>
                  <span className="task-title">{t.title}</span>
                  <span className="task-score">{score.toFixed(1)}</span>
                </div>
                <div className="task-card-meta">
                  <span className="status-badge" style={{ background: st.color }}>{st.text}</span>
                  {t.project_name && <span className="project-badge">{t.project_name}</span>}
                  {t.category_name && <span className="category-badge">{t.category_name}</span>}
                  <span className="priority-badge">P{t.priority_level}</span>
                </div>
                {t.deadline && (
                  <div className="task-deadline">
                    截止 {new Date(t.deadline).toLocaleString('zh-CN')}
                    {new Date(t.deadline) < new Date() && t.status !== 'completed' && <span className="overdue-tag">已逾期</span>}
                  </div>
                )}
                <div className="score-dimensions">
                  {[
                    { l: '紧迫度', v: N(t.urgency), c: '#f87171' },
                    { l: '重要度', v: N(t.importance), c: '#fb923c' },
                    { l: '依赖度', v: N(t.dependency), c: '#a78bfa' },
                    { l: '精力匹配', v: N(t.energy), c: '#4ade80' },
                    { l: '历史概率', v: N(t.history_prob), c: '#60a5fa' },
                  ].map(d => (
                    <div key={d.l} className="dim-item">
                      <div className="dim-label">{d.l}</div>
                      <div className="dim-bar"><div className="dim-fill" style={{ width: `${d.v}%`, background: d.c }} /></div>
                      <div className="dim-value">{d.v.toFixed(0)}</div>
                    </div>
                  ))}
                </div>
                <div className="task-card-actions">
                  <button className="btn btn-sm" onClick={e => { e.stopPropagation(); onTaskClick?.(t.task_id); }}>详情</button>
                  {t.status === 'pending' && <button className="btn btn-sm btn-start" onClick={e => { e.stopPropagation(); changeStatus(t.task_id, 'in_progress'); }}>开始</button>}
                  {t.status === 'in_progress' && <button className="btn btn-sm btn-complete" onClick={e => { e.stopPropagation(); changeStatus(t.task_id, 'completed'); }}>完成</button>}
                  {t.status !== 'completed' && <button className="btn btn-sm btn-danger" onClick={e => { e.stopPropagation(); remove(t.task_id); }}>删除</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
