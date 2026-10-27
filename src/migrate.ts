import { readFileSync } from 'fs';
import { join } from 'path';
import { pool } from './db';

export async function migrate(): Promise<void> {
  const sql = readFileSync(join(__dirname, '..', 'sql', 'schema.sql'), 'utf8');
  const statements = sql.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
  for (const statement of statements) {
    await pool.query(statement);
  }
}

if (require.main === module) {
  migrate()
    .then(() => {
      console.log('Migration complete');
      return pool.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
