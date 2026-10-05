import type { PGlite } from '@electric-sql/pglite';

export const num = (v: unknown): number => Number(v);

/** Ejecuta fn como el rol `authenticated` de Supabase con auth.uid() = userId. */
export async function comoUsuario<T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
  await db.exec('set role authenticated');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}
