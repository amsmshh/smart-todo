import React, { useEffect, useState } from 'react';
import { api } from '../api';

export default function TaskForm({ userId, onSuccess }) {
  const [form, setForm] = useState({ title: '', description: '', priority_level: 3, deadline: '', estimated_hours: '', project_id: '', category_id: '', tags: [] });
  const [projects, setProjects] = useState([]);
  const [categories, setCategories] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    Promise.all([api.getProjects(), api.getCategories(), api.getTags()])
      .then(([p, c, t]) => { setProjects(p); setCategories(c); setAllTags(t); }).catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setMsg({ type: 'error', text: '标题不能为空' }); return; }
    setSubmitting(true); setMsg(null);
    try {
      const data = { ...form, assignee_id: userId, project_id: form.project_id || null, category_id: form.category_id || null, deadline: form.deadline || null, estimated_hours: form.estimated_hours || null };
      const r = await api.createTask(data);
      setMsg({ type: 'success', text: `创建成功 ${r.smart_score ? '(评分 ' + Number(r.smart_score).toFixed(1) + ')' : ''}` });
      setForm({ title: '', description: '', priority_level: 3, deadline: '', estimated_hours: '', project_id: '', category_id: '', tags: [] });
      onSuccess?.();
    } catch (e) { setMsg({ type: 'error', text: e.message }); }
    setSubmitting(false);
  };

  return (
    <div className="task-form-page">
      <h2>新建任务</h2>
      {msg && <div className={`form-message ${msg.type}`}>{msg.text}</div>}
      <form onSubmit={handleSubmit} className="task-form">
        <div className="form-group">
          <label>标题 *</label>
          <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="任务名称" required />
        </div>
        <div className="form-group">
          <label>描述</label>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="补充说明（可选）" rows={3} />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>优先级</label>
            <select value={form.priority_level} onChange={e => setForm(f => ({ ...f, priority_level: Number(e.target.value) }))}>
              <option value={1}>P1 最高</option><option value={2}>P2 高</option><option value={3}>P3 中</option><option value={4}>P4 低</option><option value={5}>P5 最低</option>
            </select>
          </div>
          <div className="form-group">
            <label>截止时间</label>
            <input type="datetime-local" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
          </div>
          <div className="form-group">
            <label>预估工时(h)</label>
            <input type="number" min="0.5" step="0.5" value={form.estimated_hours} onChange={e => setForm(f => ({ ...f, estimated_hours: e.target.value }))} placeholder="4" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>项目</label>
            <select value={form.project_id} onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}>
              <option value="">无</option>
              {projects.map(p => <option key={p.project_id} value={p.project_id}>{p.project_name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>分类</label>
            <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}>
              <option value="">无</option>
              {categories.map(c => <option key={c.category_id} value={c.category_id}>{c.category_name}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label>标签</label>
          <div className="tag-selector">
            {allTags.map(tag => (
              <button key={tag.tag_id} type="button"
                className={`tag-btn ${form.tags.includes(tag.tag_id) ? 'selected' : ''}`}
                style={{ borderColor: tag.color, background: form.tags.includes(tag.tag_id) ? tag.color : 'transparent', color: form.tags.includes(tag.tag_id) ? '#fff' : tag.color }}
                onClick={() => setForm(f => ({ ...f, tags: f.tags.includes(tag.tag_id) ? f.tags.filter(id => id !== tag.tag_id) : [...f.tags, tag.tag_id] }))}>
                {tag.tag_name}
              </button>
            ))}
          </div>
        </div>
        <button type="submit" className="btn btn-primary btn-lg" disabled={submitting}>{submitting ? '创建中...' : '创建'}</button>
      </form>
    </div>
  );
}
