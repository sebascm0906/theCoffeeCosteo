import type { Ejecutor } from '../db/ejecutor';
import type { LibroExcel, Tamano } from './tipos';

export interface FilaConciliacion { producto: string; tamano: Tamano; costoExcel: number; costoPortal: number; diferencia: number; ok: boolean }

const TOLERANCIA = 0.01;

export async function conciliar(db: Ejecutor, libro: LibroExcel): Promise<FilaConciliacion[]> {
  const { rows } = await db.query<{ producto: string; tamano: Tamano; costo: string }>(
    `select r.nombre as producto, t.nombre as tamano, c.costo
     from v_costo_producto c
     join recetas r on r.id = c.producto_id
     join tamanos t on t.id = c.tamano_id`);
  const porProducto = new Map<string, { tamano: Tamano; costo: number }[]>();
  for (const r of rows) {
    const lista = porProducto.get(r.producto) ?? [];
    lista.push({ tamano: r.tamano, costo: Number(r.costo) });
    porProducto.set(r.producto, lista);
  }
  const resultado: FilaConciliacion[] = [];
  for (const p of libro.productos) {
    const enPortal = porProducto.get(p.nombre);
    if (!enPortal) {
      resultado.push({ producto: p.nombre, tamano: 'Único', costoExcel: p.costoChica, costoPortal: Number.NaN, diferencia: Number.NaN, ok: false });
      continue;
    }
    for (const { tamano, costo } of enPortal) {
      const costoExcel = tamano === 'Grande' ? p.costoGrande : p.costoChica;
      const diferencia = costo - costoExcel;
      resultado.push({ producto: p.nombre, tamano, costoExcel, costoPortal: costo, diferencia, ok: Math.abs(diferencia) <= TOLERANCIA });
    }
  }
  return resultado;
}
