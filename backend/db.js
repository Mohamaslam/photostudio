// MySQL connection pool using mysql2 (promise API)
// Uses environment variables: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT, DB_CONNECTION_LIMIT
// Optionally load .env when used in dev: require('dotenv').config();

require('dotenv').config();
const mysql = require('mysql2/promise');

const {
  DB_HOST = '127.0.0.1',
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'photostudio',
  DB_PORT = 3306,
  DB_CONNECTION_LIMIT = 10
} = process.env;

const pool = mysql.createPool({
  host: DB_HOST,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  port: Number(DB_PORT) || 3306,
  waitForConnections: true,
  connectionLimit: Number(DB_CONNECTION_LIMIT) || 10,
  queueLimit: 0,
  charset: 'utf8mb4'
});

// Test connection on startup to surface configuration errors early
async function testConnection() {
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    console.log('✅ MySQL pool connected');
  } catch (err) {
    console.error('❌ MySQL connection error:', err.message || err);
    // If the DB is required for the app to run, exit so the process manager can restart
    process.exit(1);
  }
}

testConnection();

// Gracefully shutdown pool on app termination
async function closePool() {
  try {
    await pool.end();
    console.log('MySQL pool closed');
  } catch (err) {
    console.warn('Error closing MySQL pool', err);
  }
}

process.on('SIGINT', closePool);
process.on('SIGTERM', closePool);

module.exports = pool;
