const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'smart_todo',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4_unicode_ci',
  charsetNumber: 255
});

// 确保每个连接都使用 UTF-8
pool.on('connection', function (connection) {
  connection.query('SET NAMES utf8mb4');
});

module.exports = pool;
