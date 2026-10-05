import Link from 'next/link';
import { sesion } from '@/lib/supabase/sesion';
import { todas, porcentaje } from '@/lib/portal/consultas';
import { indicadores } from '@/lib/portal/tablero';
import { AvisoComision } from '@/components/portal/aviso-comision';
export default async function Tablero() {
  const { db } = await sesion();
  const [filas, alertas, canales] = await Promise.all([
    todas(db, 'v_resumen', 'producto_id,tamano_id,canal_id'),
    todas(db, 'v_alerta_producto_canal', 'producto_id,canal_id'),
    todas(db, 'canales', 'id'),
  ]);
  const k = indicadores(filas);
  const activos = new Set(filas.filter((f) => f.activo).map((f) => f.producto_id));
  return (
    <>
      <header>
        <p className="text-sm text-muted-foreground">The Coffee · Productos activos</p>
        <h1>Tablero de costeos</h1>
      </header>
      <AvisoComision pendiente={canales.some((c) => !c.comision_confirmada)} />
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          ['Food cost promedio', porcentaje(k.foodCost)],
          ['Bajo objetivo', k.bajoObjetivo],
          ['Sin precio (algún tamaño)', k.sinPrecio],
          ['Pierden en delivery', k.pierdenDelivery],
        ].map(([label, valor]) => (
          <div className="panel" key={label}>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-3xl font-semibold mt-3">{valor}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Food cost: media simple por producto/tamaño en Mostrador con precio; no ponderado por ventas. Conteos
        de productos distintos. Delivery incluye Rappi y App propia.
      </p>
      <section className="panel">
        <h2>Alertas por producto y canal</h2>
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Canal</th>
                <th>Alerta</th>
              </tr>
            </thead>
            <tbody>
              {alertas
                .filter((a) => a.alerta && activos.has(a.producto_id))
                .map((a) => (
                  <tr key={`${a.producto_id}:${a.canal_id}`}>
                    <td>
                      <Link className="underline" href={`/productos/${a.producto_id}`}>
                        {a.producto}
                      </Link>
                    </td>
                    <td>{a.canal}</td>
                    <td>{a.alerta}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
