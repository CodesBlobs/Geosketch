import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sketches (
      id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      data       JSONB       NOT NULL
    )
  `);
  tableReady = true;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    await ensureTable();
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: 'Missing data' });
    const r = await pool.query(
      'INSERT INTO sketches (data) VALUES ($1) RETURNING id',
      [JSON.stringify(data)]
    );
    res.json({ id: r.rows[0].id });
  } catch (err) {
    console.error('Save error:', err.message);
    res.status(500).json({ error: 'Failed to save sketch' });
  }
}
