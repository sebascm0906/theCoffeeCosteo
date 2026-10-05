import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { agregarLinea, crearInsumo, crearProducto, idTamano } from './fabricas';
import { comoUsuario, crearUsuario, num } from './utilidades';

let db: PGlite;
let compras: string, operaciones: string, finanzas: string, admin: string, sinPerfil: string;
let insumo: string, producto: string, chica: string, grande: string;

beforeAll(async () => {
  db = await crearDbLocal();
  [compras, operaciones, finanzas, admin] = [
    await crearUsuario(db, 'compras'), await crearUsuario(db, 'operaciones'),
    await crearUsuario(db, 'finanzas'), await crearUsuario(db, 'admin'),
  ];
  sinPerfil = '00000000-0000-0000-0000-0000000000ff';
  await db.query('insert into auth.users (id) values ($1)', [sinPerfil]);
  insumo = await crearInsumo(db, { nombre: 'CAFE PERMISOS', costoPaquete: 400, presentacion: 1000 });
  producto = await crearProducto(db, { nombre: 'Latte permisos', precios: { Chica: 65 } });
  chica = await idTamano(db, 'Chica');
  grande = await idTamano(db, 'Grande');
});

const cambiarCosto = (uid: string) =>
  comoUsuario(db, uid, () => db.query('update insumos set costo_paquete = costo_paquete + 1 where id = $1 returning id', [insumo]));

describe('permisos', () => {
  it('todos los usuarios con perfil activo pueden leer tablas y vistas', async () => {
    for (const uid of [compras, operaciones, finanzas, admin]) {
      const r = await comoUsuario(db, uid, () => db.query('select count(*)::int as n from v_resumen'));
      expect(num((r.rows[0] as { n: number }).n)).toBeGreaterThan(0);
    }
  });

  const contar = (uid: string, tabla: 'insumos' | 'v_resumen') =>
    comoUsuario(db, uid, async () => num((await db.query<{ n: number }>(`select count(*)::int as n from ${tabla}`)).rows[0].n));

  it('un usuario con sesión pero sin perfil no lee nada', async () => {
    expect(await contar(sinPerfil, 'insumos')).toBe(0);
    expect(await contar(sinPerfil, 'v_resumen')).toBe(0);
  });

  it('un usuario con perfil inactivo no lee nada; uno activo sí', async () => {
    const inactivo = await crearUsuario(db, 'compras');
    await db.query('update perfiles set activo = false where user_id = $1', [inactivo]);
    expect(await contar(inactivo, 'insumos')).toBe(0);
    expect(await contar(inactivo, 'v_resumen')).toBe(0);
    expect(await contar(compras, 'insumos')).toBeGreaterThan(0);
  });

  it('authenticated no puede usar las secuencias directamente', async () => {
    await expect(comoUsuario(db, admin, () => db.query(`select nextval('bitacora_id_seq')`))).rejects.toThrow(/permission denied/);
  });

  it('anon no puede leer nada', async () => {
    await db.exec('set role anon');
    try {
      await expect(db.query('select * from insumos')).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec('reset role');
    }
  });

  it('solo Compras y Admin editan insumos', async () => {
    expect((await cambiarCosto(compras)).rows).toHaveLength(1);
    expect((await cambiarCosto(admin)).rows).toHaveLength(1);
    expect((await cambiarCosto(operaciones)).rows).toHaveLength(0);
    expect((await cambiarCosto(finanzas)).rows).toHaveLength(0);
    expect((await cambiarCosto(sinPerfil)).rows).toHaveLength(0);
  });

  it('nadie borra insumos (se desactivan)', async () => {
    await expect(comoUsuario(db, admin, () => db.query('delete from insumos where id = $1', [insumo]))).rejects.toThrow(/permission denied/);
  });

  it('solo Operaciones y Admin arman recetas', async () => {
    await expect(comoUsuario(db, compras, () => agregarLinea(db, producto, { insumoId: insumo, cantidades: { Chica: 1 } }))).rejects.toThrow(/row-level security/);
    const linea = await comoUsuario(db, operaciones, () => agregarLinea(db, producto, { insumoId: insumo, cantidades: { Chica: 18 } }));
    expect(linea).toBeTruthy();
  });

  it('solo Finanzas y Admin capturan precios de lista', async () => {
    const cambiar = (uid: string, precio: number) => comoUsuario(db, uid, () =>
      db.query('update producto_tamanos set precio_lista = $3 where producto_id = $1 and tamano_id = $2 returning precio_lista', [producto, chica, precio]));
    await expect(cambiar(operaciones, 70)).rejects.toThrow(/Solo Finanzas/);
    expect((await cambiar(compras, 70)).rows).toHaveLength(0);
    expect((await cambiar(finanzas, 70)).rows).toHaveLength(1);
  });

  it('Operaciones agrega tamaños sin precio; con precio solo Finanzas', async () => {
    const alta = (uid: string, precio: number | null) => comoUsuario(db, uid, () =>
      db.query('insert into producto_tamanos (producto_id, tamano_id, precio_lista) values ($1, $2, $3)', [producto, grande, precio]));
    await expect(alta(operaciones, 80)).rejects.toThrow(/Solo Finanzas/);
    await expect(alta(finanzas, null)).rejects.toThrow(/row-level security/);
    await alta(operaciones, null);
  });

  it('nadie puede mover un precio a otro producto o tamaño', async () => {
    const mover = () => db.query('update producto_tamanos set tamano_id = $3 where producto_id = $1 and tamano_id = $2', [producto, chica, grande]);
    await expect(comoUsuario(db, operaciones, mover)).rejects.toThrow(/No se puede cambiar el producto o el tamaño/);
    await expect(mover()).rejects.toThrow(/No se puede cambiar el producto o el tamaño/);
  });

  it('solo Finanzas y Admin cambian parámetros y canales', async () => {
    const iva = (uid: string) => comoUsuario(db, uid, () => db.query('update parametros set iva = 0.16 returning id'));
    expect((await iva(operaciones)).rows).toHaveLength(0);
    expect((await iva(finanzas)).rows).toHaveLength(1);
    const canal = (uid: string) => comoUsuario(db, uid, () => db.query(`update canales set comision_pct = 0.03 where nombre = 'App propia' returning id`));
    expect((await canal(compras)).rows).toHaveLength(0);
    expect((await canal(admin)).rows).toHaveLength(1);
  });

  it('solo Admin gestiona perfiles y nadie escribe en la bitácora', async () => {
    const cambiarRol = (uid: string) => comoUsuario(db, uid, () =>
      db.query(`update perfiles set rol = 'admin' where user_id = $1 returning user_id`, [compras]));
    expect((await cambiarRol(compras)).rows).toHaveLength(0);
    await expect(comoUsuario(db, admin, () => db.query(`insert into bitacora (tabla) values ('x')`))).rejects.toThrow(/permission denied/);
  });

  it('la bitácora registra al usuario que hizo el cambio bajo RLS', async () => {
    await cambiarCosto(compras);
    const r = await db.query<{ usuario_id: string }>(
      `select usuario_id from bitacora where registro_id = $1 and campo = 'costo_paquete' order by id desc limit 1`, [insumo]);
    expect(r.rows[0].usuario_id).toBe(compras);
  });
});
