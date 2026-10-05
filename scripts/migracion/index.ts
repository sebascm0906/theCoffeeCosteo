import { parseArgs } from 'node:util';
import pg from 'pg';
import type { Ejecutor } from '../db/ejecutor';
import { crearDbLocal } from '../db/pglite';
import { cargarPlan } from './cargar';
import { conciliar } from './conciliar';
import { leerLibro } from './leer-excel';
import { construirPlanCarga } from './plan-carga';
import { escribirReporte } from './reporte';

const { values } = parseArgs({
  options: {
    excel: { type: 'string', default: 'datos/Modelo_Costeo_Corregido_2026.xlsx' },
    reporte: { type: 'string', default: 'datos/reporte-migracion.xlsx' },
    aplicar: { type: 'boolean', default: false },
  },
});

async function main() {
  const libro = leerLibro(values.excel!);
  const plan = construirPlanCarga(libro);

  console.log('1/3 Ensayo en base local (PGlite)…');
  const local = await crearDbLocal();
  await cargarPlan(local, plan);
  const conciliacion = await conciliar(local, libro);
  escribirReporte(values.reporte!, plan, conciliacion);
  const fallas = conciliacion.filter((c) => !c.ok);
  console.log(`2/3 Reporte: ${values.reporte}  ·  ${conciliacion.length} productos×tamaño, ${fallas.length} diferencias, ${plan.avisos.length} avisos, ${plan.subrecetas.subrecetas.length} sub-recetas`);
  if (fallas.length > 0) {
    console.error('La conciliación NO cuadra. Revisa la hoja "Conciliación" del reporte. No se aplicó nada.');
    process.exit(1);
  }
  if (!values.aplicar) {
    console.log('3/3 Ensayo correcto. Para cargar en Supabase: npm run migracion -- --aplicar');
    return;
  }

  try { process.loadEnvFile('.env.local'); } catch { /* opcional */ }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL (cadena de conexión de Supabase) en .env.local');
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  try {
    const remoto: Ejecutor = { query: (sql, params) => cliente.query(sql, params as unknown[]) as never };
    console.log('3/3 Cargando en Supabase…');
    await cargarPlan(remoto, plan, async (tx) => {
      const n = (await conciliar(tx, libro)).filter((c) => !c.ok).length;
      if (n > 0) throw new Error(`La conciliación en Supabase no cuadra (${n} diferencias); no se aplicó nada`);
    });
    console.log('Listo: Supabase cuadra con el Excel.');
  } finally {
    await cliente.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
