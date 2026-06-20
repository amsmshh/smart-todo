import React, { useEffect, useState } from 'react';
import { api } from '../api';

const QUADRANTS = [
  { id: 1, name: '紧急且重要', color: '#f87171', desc: '立即执行' },
  { id: 2, name: '重要不紧急', color: '#fb923c', desc: '计划安排' },
  { id: 3, name: '紧急不重要', color: '#facc15', desc: '委托他人' },
  { id: 4, name: '不紧急不重要', color: '#5c5a70', desc: '考虑删除' },
];

export default function Matrix({ userId }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [classifying, setClassifying] = useState(false);

  const load = () => {
    setLoading(true);
    api.getEisenhower(userId).then(setData).catch(() => setData([])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [userId]);

  const classify = async () => {
    setClassifying(true);
    try {
      await api.classifyEisenhower(userId);
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setClassifying(false);
    }
  };

  const getQuadrant = (id) => data.find(d => d.eisenhower_quadrant === id) || {};

  return (
    <div className="matrix-page">
      <div className="matrix-toolbar">
        <h2>艾森豪威尔矩阵</h2>
        <button className="btn btn-primary" onClick={classify} disabled={classifying}>
          {classifying ? '归类中...' : '自动归类'}
        </button>
      </div>

      <div className="matrix-axes">
        <div className="matrix-axis-y">紧急 →</div>
        <div className="matrix-grid">
          {QUADRANTS.map(q => {
            const info = getQuadrant(q.id);
            return (
              <div key={q.id} className="matrix-cell" style={{ borderColor: q.color }}>
                <div className="matrix-cell-header" style={{ background: q.color + '22' }}>
                  <span className="matrix-cell-name">{q.name}</span>
                  <span className="matrix-cell-count">{info.task_count || 0}个任务</span>
                </div>
                <div className="matrix-cell-body">
                  {info.avg_score && <div className="matrix-cell-score">平均分 {Number(info.avg_score).toFixed(1)}</div>}
                  <div className="matrix-cell-strategy">{q.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
        <div className="matrix-axis-x">重要 →</div>
      </div>

      {!loading && data.length === 0 && (
        <div className="matrix-empty">还没有归类数据，点击"自动归类"开始</div>
      )}
    </div>
  );
}
