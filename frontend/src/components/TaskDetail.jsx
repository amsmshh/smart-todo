import React, { useEffect, useState } from 'react';
import { api } from '../api';

const STATUS_OPTIONS = [
  { value: 'pending', label: '待处理' },
  { value: 'in_progress', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
];

export default function TaskDetail({ taskId, onClose, onSaved }) {
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({});
  const [projects, setProjects] = useState([]);
  const [categories, setCategories] = useState([]);
  const [depId, setDepId] = useState('');
  const [depMsg, setDepMsg] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getTask(taskId),
      api.getProjects().catch(() => []),
      api.getCategories().catch(() => []),
    ]).then(([t, p, c]) => {
      setTask(t);
      setProjects(p);
      setCategories(c);
    }).finally(() => setLoading(false));
  }, [taskId]);

  const startEdit = () => {
    setForm({
      title: task.title || '',
      description: task.description || '',
      status: task.status,
      priority_level: task.priority_level,
      deadline: task.deadline ? task.deadline.slice(0, 16) : '',
      estimated_hours: task.estimated_hours || '',
      project_id: task.project_id || '',
      category_id: task.category_id || '',
    });
    setEditing(true);
  };

  const [saveErr, setSaveErr] = useState('');

  const save = async () => {
    setSaveErr('');
    try {
      const payload = { ...form };
      if (!payload.deadline) payload.deadline = null;
      if (!payload.project_id) payload.project_id = null;
      if (!payload.category_id) payload.category_id = null;
      if (payload.estimated_hours === '') payload.estimated_hours = null;
      payload.priority_level = Number(payload.priority_level);
      await api.updateTask(taskId, payload);
      const refreshed = await api.getTask(taskId);
      setTask(refreshed);
      setEditing(false);
      onSaved?.();
    } catch (e) { setSaveErr(e.message); }
  };

  const addDep = async () => {
    if (!depId) return;
    try {
      const res = await api.addDependency(taskId, { depends_on_id: Number(depId) });
      setDepMsg(res || '添加成功');
      setDepId('');
      const refreshed = await api.getTask(taskId);
      setTask(refreshed);
    } catch (e) {
      setDepMsg(e.message);
    }
  };

  if (loading) return <div className="modal-overlay" onClick={onClose}><div className="modal-box loading">加载中...</div></div>;
  if (!task) return null;

  const N = (v) => { const n = Number(v); return isNaN(n) ? 0 : n; };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{editing ? '编辑任务' : '任务详情'}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {editing ? (
          <div className="modal-body">
            <label>标题<input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></label>
            <label>描述<textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} /></label>
            <div className="form-row">
              <label>状态<select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select></label>
              <label>优先级<select value={form.priority_level} onChange={e => setForm(f => ({ ...f, priority_level: e.target.value }))}>
                {[1,2,3,4,5].map(n => <option key={n} value={n}>P{n}</option>)}
              </select></label>
            </div>
            <div className="form-row">
              <label>截止时间<input type="datetime-local" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} /></label>
              <label>预估工时<input type="number" value={form.estimated_hours} onChange={e => setForm(f => ({ ...f, estimated_hours: e.target.value }))} step="0.5" min="0" /></label>
            </div>
            <div className="form-row">
              <label>项目<select value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}>
                <option value="">无</option>
                {projects.map(p => <option key={p.project_id} value={p.project_id}>{p.project_name}</option>)}
              </select></label>
              <label>分类<select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
                <option value="">无</option>
                {categories.map(c => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
              </select></label>
            </div>
            {saveErr && <div className="form-message error">{saveErr}</div>}
            <div className="modal-actions">
              <button className="btn" onClick={() => setEditing(false)}>取消</button>
              <button className="btn btn-primary" onClick={save}>保存</button>
            </div>
          </div>
        ) : (
          <div className="modal-body">
            <div className="detail-field"><span className="detail-label">标题</span><span>{task.title}</span></div>
            {task.description && <div className="detail-field"><span className="detail-label">描述</span><span className="detail-desc">{task.description}</span></div>}
            <div className="detail-grid">
              <div className="detail-field"><span className="detail-label">状态</span><span className="status-badge" style={{ background: { pending:'#60a5fa', in_progress:'#fb923c', completed:'#4ade80', cancelled:'#5c5a70', blocked:'#f87171' }[task.status] }}>{task.status}</span></div>
              <div className="detail-field"><span className="detail-label">优先级</span><span>P{task.priority_level}</span></div>
              <div className="detail-field"><span className="detail-label">截止时间</span><span>{task.deadline ? new Date(task.deadline).toLocaleString('zh-CN') : '无'}</span></div>
              <div className="detail-field"><span className="detail-label">预估工时</span><span>{task.estimated_hours ? `${task.estimated_hours}h` : '无'}</span></div>
              {task.project_name && <div className="detail-field"><span className="detail-label">项目</span><span>{task.project_name}</span></div>}
              {task.category_name && <div className="detail-field"><span className="detail-label">分类</span><span>{task.category_name}</span></div>}
            </div>

            {task.tags?.length > 0 && (
              <div className="detail-field"><span className="detail-label">标签</span>
                <div className="detail-tags">{task.tags.map(t => <span key={t.tag_id} className="tag-pill" style={{ borderColor: t.color }}>{t.tag_name}</span>)}</div>
              </div>
            )}

            {(task.dependencies?.length > 0 || task.dependents?.length > 0) && (
              <div className="detail-section">
                <h4>依赖关系</h4>
                {task.dependencies?.length > 0 && (
                  <div className="dep-list">
                    <span className="detail-label">前置任务：</span>
                    {task.dependencies.map(d => (
                      <span key={d.dep_id} className={`dep-item dep-${d.depends_on_status}`}>
                        {d.depends_on_title} {d.depends_on_status === 'completed' ? '✓' : '⏳'}
                      </span>
                    ))}
                  </div>
                )}
                {task.dependents?.length > 0 && (
                  <div className="dep-list">
                    <span className="detail-label">后续任务：</span>
                    {task.dependents.map(d => (
                      <span key={d.dep_id} className={`dep-item dep-${d.task_status}`}>
                        {d.task_title}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="detail-section">
              <h4>添加依赖</h4>
              <div className="dep-add-row">
                <input placeholder="前置任务ID" value={depId} onChange={e => setDepId(e.target.value)} />
                <button className="btn btn-sm" onClick={addDep}>添加</button>
                {depMsg && <span className="dep-msg">{depMsg}</span>}
              </div>
            </div>

            {task.scores?.length > 0 && (
              <div className="detail-section">
                <h4>评分历史</h4>
                <div className="score-history">
                  {task.scores.map((s, i) => (
                    <div key={s.score_id} className="score-history-row">
                      <span className="score-time">{new Date(s.scored_at).toLocaleString('zh-CN')}</span>
                      <span className="score-val">{N(s.total_score).toFixed(1)}</span>
                      <span className="score-dims">紧迫{N(s.urgency_score).toFixed(0)} 重要{N(s.importance_score).toFixed(0)} 依赖{N(s.dependency_score).toFixed(0)} 精力{N(s.energy_score).toFixed(0)} 历史{N(s.history_score).toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn" onClick={onClose}>关闭</button>
              <button className="btn btn-primary" onClick={startEdit}>编辑</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
