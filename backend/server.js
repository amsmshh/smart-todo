const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// 路由
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/users', require('./routes/users'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/dashboard', require('./routes/dashboard'));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`智能待办事项后端API运行在 http://localhost:${PORT}`);
});
