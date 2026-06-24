import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export default async function handler(req, res) {
  const { id } = req.query;

  if (req.method === 'GET') {
    try {
      const r = await pool.query('SELECT data FROM sketches WHERE id=$1', [id]);
      if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
      res.json({ data: r.rows[0].data });
    } catch (err) {
      console.error('Load error:', err.message);
      res.status(500).json({ error: 'Failed to load sketch' });
    }
    return;
  }

  if (req.method === 'PUT') {
    try {
      const { data } = req.body;
      const r = await pool.query(
        'UPDATE sketches SET data=$1, updated_at=NOW() WHERE id=$2 RETURNING id',
        [JSON.stringify(data), id]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
      res.json({ id: r.rows[0].id });
    } catch (err) {
      console.error('Update error:', err.message);
      res.status(500).json({ error: 'Failed to update sketch' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
