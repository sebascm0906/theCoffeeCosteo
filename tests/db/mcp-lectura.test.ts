import { beforeAll, afterAll, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario } from './utilidades';
import { crearInsumo } from './fabricas';
let db: PGlite, admin: string, otro: string, insumo: string;
beforeAll(async () => {db=await crearDbLocal();admin=await crearUsuario(db,'admin');otro=await crearUsuario(db,'compras');insumo=await crearInsumo(db,{nombre:'MCP Café',costoPaquete:100,presentacion:1000});});
afterAll(async () => db.close());
async function oauth<T>(fn:()=>Promise<T>) {
  await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({client_id:'claude-client'})]);
  try { return await comoUsuario(db,admin,fn); }
  finally { await db.query(`select set_config('request.jwt.claims','',false)`); }
}
it('permite leer insumos, restringe perfiles al propio y oculta bitácora',async () => {
  await oauth(async () => {
    expect((await db.query('select id from insumos where id=$1',[insumo])).rows).toHaveLength(1);
    expect((await db.query('select user_id from perfiles')).rows).toEqual([{user_id:admin}]);
    expect((await db.query('select * from bitacora')).rows).toHaveLength(0);
    expect((await db.query<{ok:boolean}>('select mcp_lectura_habilitada() ok')).rows[0].ok).toBe(true);
  });
  expect((await db.query('select user_id from perfiles where user_id=$1',[otro])).rows).toHaveLength(1);
});
it('un administrador delegado no cambia datos ni perfiles, tampoco mediante RPC',async () => {
  await oauth(async () => {
    expect((await db.query('update insumos set costo_paquete=999 where id=$1 returning id',[insumo])).rows).toHaveLength(0);
    expect((await db.query('update perfiles set activo=false returning user_id')).rows).toHaveLength(0);
    await expect(db.query(`insert into proveedores(nombre) values('OAuth denegado')`)).rejects.toThrow(/row-level security/);
    await expect(db.query(`select guardar_receta($1::jsonb)`,[JSON.stringify({nombre:'OAuth denegado',tipo:'subreceta',categoria_id:null,rendimiento:10,unidad_rendimiento:'ml',activo:true,tamanos:[],lineas:[]})])).rejects.toThrow(/row-level security/);
  });
  expect(Number((await db.query<{costo_paquete:string}>('select costo_paquete from insumos where id=$1',[insumo])).rows[0].costo_paquete)).toBe(100);
  expect((await db.query(`select id from recetas where nombre='OAuth denegado'`)).rows).toHaveLength(0);
});
it('protege todas las tablas para cada tipo de escritura y conserva las sesiones del portal',async () => {
  const r=await db.query<{n:number}>(`select count(*)::int n from pg_policy where polname in ('oauth_sin_altas','oauth_sin_cambios','oauth_sin_bajas')`);
  expect(r.rows[0].n).toBe(42);
  await comoUsuario(db,admin,async () => {
    expect((await db.query('update insumos set costo_paquete=101 where id=$1 returning id',[insumo])).rows).toHaveLength(1);
    expect((await db.query('select user_id from perfiles')).rows).toHaveLength(2);
  });
});
it('perfil inactivo no lee datos aunque el token sea OAuth',async () => {
  await db.query('update perfiles set activo=false where user_id=$1',[admin]);
  await oauth(async () => expect((await db.query('select id from insumos')).rows).toHaveLength(0));
  await db.query('update perfiles set activo=true where user_id=$1',[admin]);
});
