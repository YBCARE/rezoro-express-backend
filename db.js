const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.warn('Warning: DATABASE_URL is not set. Set it in backend/.env before calling /api/track.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle Postgres client:', err);
});

module.exports = { pool };
