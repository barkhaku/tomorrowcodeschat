import { createPool, PoolConnection } from 'mysql2/promise';
import { config } from './config';

// timezone 'Z' + UTC defaults in the schema => all timestamps are UTC regardless of server settings.
export const pool = createPool({
  uri: config.databaseUrl,
  timezone: 'Z',
  waitForConnections: true,
  connectionLimit: 10,
});

export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
