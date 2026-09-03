import pg from 'pg';
import type { PoolClient } from 'pg';
export type DB = PoolClient;
export const createPool = (url: string) => new pg.Pool({ connectionString: url, max: 8 });
export const migration = `
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, username text UNIQUE NOT NULL, password_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 access_hash text UNIQUE NOT NULL, refresh_hash text UNIQUE NOT NULL,
 access_expires timestamptz NOT NULL, refresh_expires timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS wallets (
 user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 epoch bigint NOT NULL DEFAULT 1, revision bigint NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS records (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind text NOT NULL, id text NOT NULL, value jsonb, revision bigint NOT NULL,
 PRIMARY KEY(user_id,kind,id)
);
CREATE INDEX IF NOT EXISTS records_revision ON records(user_id,revision);
CREATE TABLE IF NOT EXISTS operations (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 epoch bigint NOT NULL, id text NOT NULL, digest text NOT NULL,
 PRIMARY KEY(user_id,epoch,id)
);
CREATE TABLE IF NOT EXISTS restores (
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 id text NOT NULL, epoch bigint NOT NULL, digest text NOT NULL,
 PRIMARY KEY(user_id,id)
);
CREATE TABLE IF NOT EXISTS recovery_backups (
 id bigserial PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 reason text NOT NULL, encrypted_data text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
DO $$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['wallets','records','operations','restores','recovery_backups'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tab);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', tab);
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename=tab AND policyname='account_isolation') THEN
   EXECUTE format('CREATE POLICY account_isolation ON %I USING (user_id = nullif(current_setting(''wallet.user_id'',true),'''')::uuid) WITH CHECK (user_id = nullif(current_setting(''wallet.user_id'',true),'''')::uuid)',tab);
  END IF;
 END LOOP;
END $$;
`;
export async function transaction<T>(pool: pg.Pool, userId: string, fn: (db: DB) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query("SELECT set_config('wallet.user_id',$1,true)", [userId]);
    const result = await fn(db);
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally { db.release(); }
}
