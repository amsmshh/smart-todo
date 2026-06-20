import React, { useState } from 'react';
import { api } from '../api';

export default function Login({ onLogin }) {
  const [isReg, setIsReg] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', email: '' });
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErr('');
    setLoading(true);
    try {
      if (isReg) {
        if (!form.username || !form.password || !form.email) { setErr('请把信息填完整'); setLoading(false); return; }
        await api.register({ username: form.username, password: form.password, email: form.email });
        const user = await api.login({ username: form.username, password: form.password });
        onLogin(user);
      } else {
        if (!form.username || !form.password) { setErr('账号密码不能为空'); setLoading(false); return; }
        const user = await api.login({ username: form.username, password: form.password });
        onLogin(user);
      }
    } catch (e) {
      setErr(e.message || (isReg ? '注册失败' : '账号或密码不对'));
    }
    setLoading(false);
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <h1>SmartTodo</h1>
          <p>多因子智能优先级排序</p>
        </div>
        <div className="login-tabs">
          <button className={`login-tab ${!isReg ? 'active' : ''}`} onClick={() => { setIsReg(false); setErr(''); }}>登录</button>
          <button className={`login-tab ${isReg ? 'active' : ''}`} onClick={() => { setIsReg(true); setErr(''); }}>注册</button>
        </div>
        {err && <div className="login-error">{err}</div>}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>用户名</label>
            <input type="text" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} placeholder="输入用户名" autoFocus />
          </div>
          {isReg && (
            <div className="form-group">
              <label>邮箱</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="you@example.com" />
            </div>
          )}
          <div className="form-group">
            <label>密码</label>
            <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="输入密码" />
          </div>
          <button type="submit" className="btn-login" disabled={loading}>
            {loading ? '...' : (isReg ? '注册' : '登录')}
          </button>
        </form>
        <div className="login-hint">测试账号 admin / admin123</div>
      </div>
    </div>
  );
}
