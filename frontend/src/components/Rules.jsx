import React, { useEffect, useState } from 'react';
import { api } from '../api';

const DIMS = [
  { key: 'w_urgency', label: '紧迫度', color: '#f87171', desc: '截止时间越近分越高' },
  { key: 'w_importance', label: '重要度', color: '#fb923c', desc: '优先级越高分越高' },
  { key: 'w_dependency', label: '依赖度', color: '#a78bfa', desc: '被依赖越多分越高' },
  { key: 'w_energy', label: '精力匹配', color: '#4ade80', desc: '匹配当前精力水平' },
  { key: 'w_history', label: '历史概率', color: '#60a5fa', desc: '基于历史完成率' },
];

export default function Rules({ userId, onClose }) {
  const [rules, setRules] = useState([]);
  const [activeRule, setActiveRule] = useState(null);
  const [weights, setWeights] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    api.getRules(userId).then(r => {
      setRules(r);
      if (r.length > 0) selectRule(r[0]);
    }).catch(() => {});
  }, [userId]);

  const selectRule = (rule) => {
    setActiveRule(rule);
    setWeights({
      w_urgency: Number(rule.w_urgency),
      w_importance: Number(rule.w_importance),
      w_dependency: Number(rule.w_dependency),
      w_energy: Number(rule.w_energy),
      w_history: Number(rule.w_history),
    });
    setMsg('');
  };

  const updateWeight = (key, val) => {
    const num = Number(val);
    setWeights(w => {
      const updated = { ...w, [key]: num };
      const sum = Object.values(updated).reduce((a, b) => a + b, 0);
      setMsg(sum.toFixed(2) === '1.00' ? '' : `当前总和: ${sum.toFixed(2)}，需等于1.00`);
      return updated;
    });
  };

  const normalize = () => {
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    if (sum === 0) return;
    setWeights(w => {
      const normalized = {};
      for (const k in w) normalized[k] = Math.round(w[k] / sum * 100) / 100;
      // 修正浮点误差
      const diff = 1.0 - Object.values(normalized).reduce((a, b) => a + b, 0);
      const maxKey = Object.keys(normalized).reduce((a, b) => normalized[a] > normalized[b] ? a : b);
      normalized[maxKey] = Math.round((normalized[maxKey] + diff) * 100) / 100;
      setMsg('');
      return normalized;
    });
  };

  const save = async () => {
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1.0) > 0.01) { setMsg('权重之和必须等于1.0'); return; }
    setSaving(true);
    try {
      await api.updateRule(userId, activeRule.rule_id, weights);
      setMsg('保存成功');
    } catch (e) {
      setMsg(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>优先级规则管理</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {rules.length > 1 && (
            <div className="rules-tabs">
              {rules.map(r => (
                <button key={r.rule_id} className={`rules-tab ${activeRule?.rule_id === r.rule_id ? 'active' : ''}`}
                  onClick={() => selectRule(r)}>
                  {r.rule_name}
                </button>
              ))}
            </div>
          )}

          {activeRule && (
            <div className="rules-editor">
              {DIMS.map(d => (
                <div key={d.key} className="rule-slider-row">
                  <div className="rule-slider-label">
                    <span className="rule-dot" style={{ background: d.color }} />
                    <span>{d.label}</span>
                    <span className="rule-slider-val">{weights[d.key]?.toFixed(2)}</span>
                  </div>
                  <input type="range" min="0" max="0.6" step="0.01"
                    value={weights[d.key] || 0}
                    onChange={e => updateWeight(d.key, e.target.value)}
                    style={{ '--slider-color': d.color }}
                    className="rule-slider" />
                  <div className="rule-slider-desc">{d.desc}</div>
                </div>
              ))}

              <div className="rule-visual-bar">
                {DIMS.map(d => (
                  <div key={d.key} className="rule-bar-seg"
                    style={{ width: `${(weights[d.key] || 0) * 100}%`, background: d.color }}>
                    {(weights[d.key] || 0) >= 0.08 && <span>{d.label}</span>}
                  </div>
                ))}
              </div>

              <div className="rules-actions">
                <button className="btn" onClick={normalize}>自动归一</button>
                <button className="btn btn-primary" onClick={save} disabled={saving || !!msg}>
                  {saving ? '保存中...' : '保存'}
                </button>
              </div>
              {msg && <div className="rules-msg">{msg}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
