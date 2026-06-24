import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// One-time table init
await pool.query(`
  CREATE TABLE IF NOT EXISTS sketches (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    data       JSONB       NOT NULL
  )
`);
console.log('DB ready');

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

// ── Save new sketch ───────────────────────────────────────────────────────────
app.post('/api/save', async (req, res) => {
  try {
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
});

// ── Update existing sketch ────────────────────────────────────────────────────
app.put('/api/sketch/:id', async (req, res) => {
  try {
    const { data } = req.body;
    const r = await pool.query(
      'UPDATE sketches SET data=$1, updated_at=NOW() WHERE id=$2 RETURNING id',
      [JSON.stringify(data), req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ id: r.rows[0].id });
  } catch (err) {
    console.error('Update error:', err.message);
    res.status(500).json({ error: 'Failed to update sketch' });
  }
});

// ── Load sketch ───────────────────────────────────────────────────────────────
app.get('/api/sketch/:id', async (req, res) => {
  try {
    const r = await pool.query('SELECT data FROM sketches WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ data: r.rows[0].data });
  } catch (err) {
    console.error('Load error:', err.message);
    res.status(500).json({ error: 'Failed to load sketch' });
  }
});

// ── Serve built frontend in production ────────────────────────────────────────
const dist = path.join(__dirname, '..', 'dist');
app.use(express.static(dist));
app.get('/{*path}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
