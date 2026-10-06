import { beforeAll, afterAll, beforeEach, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario } from './utilidades';
let db: PGlite, usuario: string, otro: string;
beforeAll(async () => {
  db = await crearDbLocal();
  usuario = await crearUsuario(db, 'operaciones');
  otro = await crearUsuario(db, 'compras');
});
afterAll(async () => db.close());
beforeEach(async () => {
  await db.exec('delete from chat_cupos');
});
const reservar = async () =>
  (await db.query<{ ok: boolean }>('select reservar_consulta_chat() ok')).rows[0].ok;
it('admite cinco consultas por minuto, separa usuarios y renueva la ventana', async () => {
  await comoUsuario(db, usuario, async () => {
    expect(await Promise.all(Array.from({ length: 6 }, reservar))).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
    ]);
  });
  await comoUsuario(db, otro, async () => expect(await reservar()).toBe(true));
  await db.query("update chat_cupos set ventana=clock_timestamp()-interval '2 minutes' where usuario_id=$1", [
    usuario,
  ]);
  await comoUsuario(db, usuario, async () => expect(await reservar()).toBe(true));
});
it('respeta sesenta por día y trescientas globales', async () => {
  await comoUsuario(db, usuario, reservar);
  await db.query('update chat_cupos set consultas=60 where usuario_id=$1', [usuario]);
  await comoUsuario(db, usuario, async () => expect(await reservar()).toBe(false));
  await db.query('update chat_cupos set consultas=300 where usuario_id=$1', [usuario]);
  await comoUsuario(db, otro, async () => expect(await reservar()).toBe(false));
});
it('no permite resetear contadores ni usar la reserva con perfil inactivo u OAuth', async () => {
  await comoUsuario(db, usuario, async () => {
    await expect(db.exec('delete from chat_cupos')).rejects.toThrow(/permission denied/);
    await expect(db.exec('select * from chat_cupos')).rejects.toThrow(/permission denied/);
  });
  await db.query('select set_config(\'request.jwt.claims\', \'{"client_id":"claude"}\', false)');
  await comoUsuario(db, usuario, async () => {
    await expect(reservar()).rejects.toThrow(/sesión activa/);
  });
  await db.query("select set_config('request.jwt.claims', '', false)");
  await db.query('update perfiles set activo=false where user_id=$1', [otro]);
  await comoUsuario(db, otro, async () => {
    await expect(reservar()).rejects.toThrow(/sesión activa/);
  });
});
