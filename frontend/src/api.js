const API_BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const text = await res.text();
  if (!text) throw new Error(`服务器返回空响应 (${res.status})`);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`服务器响应非JSON: ${text.slice(0, 200)}`);
  }
  if (!data.success) throw new Error(data.message || '请求失败');
  return data.data;
}

export const api = {
  // 任务
  getTasks: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/tasks?${qs}`);
  },
  getTask: (id) => request(`/tasks/${id}`),
  createTask: (data) => request('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  updateTask: (id, data) => request(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),
  scoreTask: (id) => request(`/tasks/${id}/score`, { method: 'POST' }),
  addDependency: (id, data) => request(`/tasks/${id}/dependencies`, { method: 'POST', body: JSON.stringify(data) }),
  classifyEisenhower: (userId) => request(`/tasks/classify/${userId}`, { method: 'POST' }),
  getEisenhower: (userId) => request(`/tasks/eisenhower/${userId}`),
  refreshAllScores: () => request('/tasks/refresh-scores/all', { method: 'POST' }),
  batchStatus: (ids, status) => request('/tasks/batch-status', { method: 'POST', body: JSON.stringify({ ids, status }) }),
  batchDelete: (ids) => request('/tasks/batch-delete', { method: 'POST', body: JSON.stringify({ ids }) }),
  reorderTasks: (orders) => request('/tasks/reorder', { method: 'POST', body: JSON.stringify({ orders }) }),

  // 用户
  login: (data) => request('/users/login', { method: 'POST', body: JSON.stringify(data) }),
  register: (data) => request('/users/register', { method: 'POST', body: JSON.stringify(data) }),
  getEnergy: (userId) => request(`/users/${userId}/energy`),
  getRules: (userId) => request(`/users/${userId}/rules`),
  updateRule: (userId, ruleId, data) => request(`/users/${userId}/rules/${ruleId}`, { method: 'PUT', body: JSON.stringify(data) }),
  getPreferences: (userId) => request(`/users/${userId}/preferences`),
  savePreference: (userId, data) => request(`/users/${userId}/preferences`, { method: 'PUT', body: JSON.stringify(data) }),

  // 项目
  getProjects: () => request('/projects'),
  createProject: (data) => request('/projects', { method: 'POST', body: JSON.stringify(data) }),

  // 分类和标签
  getCategories: () => request('/categories'),
  getTags: () => request('/categories/tags'),

  // 仪表盘
  getDashboardStats: (userId) => request(`/dashboard/stats/${userId}`),
  getRanking: (userId) => request(`/dashboard/ranking/${userId}`),
};
