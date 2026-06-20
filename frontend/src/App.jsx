import React, { useState } from 'react';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import TaskList from './components/TaskList';
import TaskForm from './components/TaskForm';
import TaskDetail from './components/TaskDetail';
import Matrix from './components/Matrix';
import Rules from './components/Rules';

export default function App() {
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('dashboard');
  const [rk, setRk] = useState(0);
  const [detailId, setDetailId] = useState(null);
  const [showRules, setShowRules] = useState(false);

  if (!user) return <Login onLogin={setUser} />;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-top">
          <h1>SmartTodo</h1>
          <div className="user-info">
            <button className="btn-icon" onClick={() => setShowRules(true)} title="评分规则">⚙</button>
            <span>{user.username}</span>
            <button className="btn-logout" onClick={() => setUser(null)}>退出</button>
          </div>
        </div>
        <nav className="nav-tabs">
          {[
            { key: 'dashboard', icon: '📊', label: '总览' },
            { key: 'tasks', icon: '📋', label: '任务' },
            { key: 'matrix', icon: '⬜', label: '矩阵' },
            { key: 'create', icon: '＋', label: '新建' },
          ].map(t => (
            <button key={t.key} className={`nav-tab ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}>
              <span className="tab-icon">{t.icon}</span>{t.label}
            </button>
          ))}
        </nav>
      </header>
      <main className="app-main">
        {tab === 'dashboard' && <Dashboard key={rk} userId={user.user_id} />}
        {tab === 'tasks' && <TaskList key={rk} userId={user.user_id} onRefresh={() => setRk(k => k + 1)} onTaskClick={setDetailId} />}
        {tab === 'matrix' && <Matrix userId={user.user_id} />}
        {tab === 'create' && <TaskForm userId={user.user_id} onSuccess={() => { setRk(k => k + 1); setTab('tasks'); }} />}
      </main>
      {detailId && <TaskDetail taskId={detailId} onClose={() => setDetailId(null)} onSaved={() => setRk(k => k + 1)} />}
      {showRules && <Rules userId={user.user_id} onClose={() => setShowRules(false)} />}
    </div>
  );
}
