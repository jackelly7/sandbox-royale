import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
if (!process.env.MULTIPLAYER_DATABASE_URL)
  throw new Error('MULTIPLAYER_DATABASE_URL is required.');
const pool = new Pool({
  connectionString: process.env.MULTIPLAYER_DATABASE_URL,
});
try {
  await pool.query(
    readFileSync(new URL('../server/schema.sql', import.meta.url), 'utf8'),
  );
  console.log('Database schema applied.');
} finally {
  await pool.end();
}
