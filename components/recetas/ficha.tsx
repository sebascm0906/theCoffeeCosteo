import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sesion } from '@/lib/supabase/sesion';
import { todas, dinero, porcentaje } from '@/lib/portal/consultas';
import { cargarEditor } from '@/lib/portal/recetas';
import { dependientes } from '@/lib/portal/dependencias';
import { puede } from '@/lib/portal/permisos';
import { EditorReceta } from './editor-receta';
import { AvisoComision } from '@/components/portal/aviso-comision';
import { EditorPrecios } from './editor-precios';
import { HistorialReceta } from './historial-receta';
export async function Ficha({ id, tipo }: { id?: string; tipo: 'producto' | 'subreceta' }) {
  const { db, perfil } = await sesion();
  const editor = await cargarEditor(db, tipo, id);
  if (!editor) notFound();
  const [resumen, historial, canales, manuales, usuarios] = await Promise.all([
    id && tipo === 'producto' ? todas(db, 'v_resumen', 'producto_id,tamano_id,canal_id') : [],
    id
      ? db.from('bitacora').select('*').eq('receta_id', id).order('id', { ascending: false }).limit(50)
      : { data: [], error: null },
    todas(db, 'canales', 'orden,id'),
    id && tipo === 'producto' ? todas(db, 'precio_canal_manual', 'producto_id,tamano_id,canal_id') : [],
    todas(db, 'perfiles', 'user_id'),
  ]);
  if (historial.error) throw new Error('No se pudo consultar el historial');
  const filas = resumen.filter((r) => r.producto_id === id);
  const usos = id ? dependientes(editor.lineas, editor.recetas, id, 'subreceta') : [];
  return (
    <>
      <header>
        <Link
          className="text-sm underline text-muted-foreground"
          href={tipo === 'producto' ? '/productos' : '/subrecetas'}
        >
          Volver al catálogo
        </Link>
        <h1>{id ? editor.borrador.nombre : tipo === 'producto' ? 'Nuevo producto' : 'Nueva sub-receta'}</h1>
      </header>
      {id && tipo === 'producto' && (
        <>
          <AvisoComision pendiente={canales.some((c) => !c.comision_confirmada)} />
          <div className="panel overflow-x-auto">
            <h2 className="mb-4">Costeo oficial</h2>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Tamaño</th>
                  <th>Canal</th>
                  <th>Costo</th>
                  <th>Precio calculado</th>
                  <th>Manual</th>
                  <th>Precio final</th>
                  <th>Margen</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={`${f.tamano_id}:${f.canal_id}`}>
                    <td>{f.tamano}</td>
                    <td>{f.canal}</td>
                    <td>{dinero(f.costo)}</td>
                    <td>{dinero(f.precio_calculado)}</td>
                    <td>{f.precio_manual === null ? '—' : dinero(f.precio_manual)}</td>
                    <td>{dinero(f.precio_canal)}</td>
                    <td>
                      {dinero(f.margen)} · {porcentaje(f.margen_pct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <EditorPrecios filas={filas} manuales={manuales} editable={puede(perfil.rol, 'precios')} />
        </>
      )}
      {id && tipo === 'subreceta' && (
        <section className="panel">
          <h2>Costo oficial por unidad de rendimiento</h2>
          <p className="mt-3 text-xl">
            {new Intl.NumberFormat('es-MX', {
              style: 'currency',
              currency: 'MXN',
              maximumFractionDigits: 6,
            }).format(editor.costoOficial)}{' '}
            / {editor.borrador.unidad_rendimiento}
          </p>
        </section>
      )}
      <EditorReceta
        key={editor.borrador.id ?? 'nueva'}
        inicial={editor.borrador}
        opciones={editor.opciones}
        categorias={editor.categorias}
        tamanos={editor.tamanos}
        editable={puede(perfil.rol, 'recetas')}
        afectados={usos.map((r) => r.nombre)}
      />
      {tipo === 'subreceta' && (
        <section className="panel">
          <h2>Usada en (directa e indirectamente)</h2>
          <ul className="mt-3 space-y-2">
            {usos.map((r) => (
              <li key={r.id}>
                <Link
                  className="underline"
                  href={`/${r.tipo === 'producto' ? 'productos' : 'subrecetas'}/${r.id}`}
                >
                  {r.nombre}
                </Link>
              </li>
            ))}
          </ul>
          {!usos.length && <p>Sin uso registrado.</p>}
        </section>
      )}
      {id && (
        <HistorialReceta
          id={id}
          inicial={historial.data ?? []}
          usuarios={Object.fromEntries(usuarios.map((u) => [u.user_id, u.nombre]))}
        />
      )}
    </>
  );
}
