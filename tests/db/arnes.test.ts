import { describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario } from './utilidades';

describe('arnés PGlite', () => {
  it('auth.uid() es null sin sesión y toma el usuario dentro de comoUsuario', async () => {
    const db = await crearDbLocal();
    const sinSesion = await db.query<{ uid: string | null }>('select auth.uid() as uid');
    expect(sinSesion.rows[0].uid).toBeNull();
    const id = '00000000-0000-0000-0000-000000000001';
    const dentro = await comoUsuario(db, id, () =>
      db.query<{ uid: string; rol: string }>('select auth.uid() as uid, current_user as rol'),
    );
    expect(dentro.rows[0]).toEqual({ uid: id, rol: 'authenticated' });
    const despues = await db.query<{ rol: string }>('select current_user as rol');
    expect(despues.rows[0].rol).not.toBe('authenticated');
  });
});
