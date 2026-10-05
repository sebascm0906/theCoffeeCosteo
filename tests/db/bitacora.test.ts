import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { agregarLinea, crearInsumo, crearProducto, idTamano } from './fabricas';
import { crearUsuario } from './utilidades';

let db: PGlite;
beforeAll(async () => { db = await crearDbLocal(); });

type Fila = { tabla: string; registro_id: string; receta_id: string | null; campo: string; valor_anterior: string | null; valor_nuevo: string | null; usuario_id: string | null; origen: string };
const bitacoraDe = async (registroId: string) =>
  (await db.query<Fila>('select * from bitacora where registro_id = $1 order by id', [registroId])).rows;

describe('bitácora', () => {
  it('registra cada campo cambiado con valor anterior, nuevo y usuario', async () => {
    const usuario = await crearUsuario(db, 'compras');
    const insumo = await crearInsumo(db, { nombre: 'CAFE BITACORA', costoPaquete: 400, presentacion: 1000 });
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [usuario]);
    await db.query('update insumos set costo_paquete = 450, presentacion = 1000 where id = $1', [insumo]);
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
    const filas = (await bitacoraDe(insumo)).filter((f) => f.campo !== '*');
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ tabla: 'insumos', campo: 'costo_paquete', valor_anterior: '400', valor_nuevo: '450', usuario_id: usuario, origen: 'portal' });
  });

  it('registra altas y bajas como un solo renglón con el registro completo', async () => {
    const insumo = await crearInsumo(db, { nombre: 'ALTA BITACORA', costoPaquete: 1, presentacion: 1 });
    const alta = await bitacoraDe(insumo);
    expect(alta).toHaveLength(1);
    expect(alta[0].campo).toBe('*');
    expect(alta[0].valor_nuevo).toContain('ALTA BITACORA');
  });

  it('liga los cambios de cantidades a su receta', async () => {
    const insumo = await crearInsumo(db, { nombre: 'CAFE RECETA', costoPaquete: 400, presentacion: 1000 });
    const p = await crearProducto(db, { nombre: 'Producto bitácora', precios: { Único: 50 } });
    const linea = await agregarLinea(db, p, { insumoId: insumo, cantidades: { Único: 18 } });
    const tamano = await idTamano(db, 'Único');
    await db.query('update linea_cantidades set cantidad = 20 where linea_id = $1', [linea]);
    const filas = await bitacoraDe(`${linea}:${tamano}`);
    const cambio = filas.find((f) => f.campo === 'cantidad');
    expect(cambio).toMatchObject({ tabla: 'linea_cantidades', receta_id: p, valor_anterior: '18', valor_nuevo: '20' });
  });

  it('no registra nada con origen migracion y respeta carga_masiva', async () => {
    const insumo = await crearInsumo(db, { nombre: 'ORIGEN', costoPaquete: 1, presentacion: 1 });
    await db.exec(`begin; select set_config('app.origen', 'migracion', true); update insumos set costo_paquete = 2 where nombre = 'ORIGEN'; commit;`);
    expect((await bitacoraDe(insumo)).filter((f) => f.campo === 'costo_paquete')).toHaveLength(0);
    await db.exec(`begin; select set_config('app.origen', 'carga_masiva', true); update insumos set costo_paquete = 3 where nombre = 'ORIGEN'; commit;`);
    const filas = (await bitacoraDe(insumo)).filter((f) => f.campo === 'costo_paquete');
    expect(filas.map((f) => f.origen)).toEqual(['carga_masiva']);
  });

  it('ignora columnas técnicas (updated_at, version, costo_unitario)', async () => {
    const insumo = await crearInsumo(db, { nombre: 'TECNICO', costoPaquete: 1, presentacion: 1 });
    await db.query('update insumos set costo_paquete = 5 where id = $1', [insumo]);
    const campos = (await bitacoraDe(insumo)).map((f) => f.campo);
    expect(campos).not.toContain('updated_at');
    expect(campos).not.toContain('costo_unitario');
  });

  it('rol_actual y tiene_rol leen el perfil del usuario en sesión', async () => {
    const usuario = await crearUsuario(db, 'finanzas');
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [usuario]);
    const r = await db.query<{ rol: string; si: boolean; no: boolean }>(
      `select rol_actual() as rol, tiene_rol('finanzas', 'admin') as si, tiene_rol('compras') as no`,
    );
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
    expect(r.rows[0]).toEqual({ rol: 'finanzas', si: true, no: false });
  });
});
