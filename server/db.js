// server/db.js (建议替换)
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const DB_HOST = process.env.DB_HOST || 'db';
const DB_PORT = parseInt(process.env.DB_PORT || '3306', 10);
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'pontoon_db';

const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  charset: process.env.DB_CHARSET || 'utf8mb4',
  dateStrings: true,
});

async function testConnectionWithRetry(maxAttempts = 12, baseDelayMs = 500) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const [rows] = await pool.query('SELECT VERSION() as v');
      console.log(`DB connected (attempt ${attempt}) version=${rows[0].v} host=${DB_HOST}:${DB_PORT}`);
      return;
    } catch (err) {
      console.warn(`DB connection test FAILED (attempt ${attempt}/${maxAttempts})`, err.code || err.message);
      if (attempt === maxAttempts) {
        console.error('DB not reachable after retries. The app will continue running and will fail DB queries until DB becomes available.');
        return;
      }
      // exponential backoff
      const waitMs = baseDelayMs * Math.min(30, Math.pow(1.5, attempt));
      await new Promise(r => setTimeout(r, waitMs));
    }
  }
}

testConnectionWithRetry().catch(e => console.error('DB test unexpected error', e));

export default pool;
