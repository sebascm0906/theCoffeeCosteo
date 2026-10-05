import { sesion } from '@/lib/supabase/sesion';
import { todas } from '@/lib/portal/consultas';
import { campos, areas, type TablaEditable } from '@/lib/portal/configuracion';
import { puede } from '@/lib/portal/permisos';
import { FormularioRegistro } from '@/components/portal/formulario-registro';
import { AvisoComision } from '@/components/portal/aviso-comision';
const secciones: [TablaEditable, string][] = [
  ['parametros', 'Parámetros'],
  ['canales', 'Canales'],
  ['tamanos', 'Tamaños'],
  ['proveedores', 'Proveedores'],
  ['categorias_insumo', 'Categorías de insumo'],
  ['categorias_producto', 'Categorías de producto'],
];
export default async function Configuracion() {
  const { db, perfil } = await sesion();
  const datos = await Promise.all(secciones.map(([tabla]) => todas(db, tabla, 'id')));
  return (
    <>
      <h1>Configuración</h1>
      <p className="text-muted-foreground">
        Cada área edita sus catálogos. Los canales son fijos y los tamaños se crean o editan.
      </p>
      {secciones.map(([tabla, titulo], i) => (
        <section key={tabla} className="panel space-y-4">
          <h2>{titulo}</h2>
          {tabla === 'canales' && (
            <AvisoComision
              pendiente={datos[i].some((r) => 'comision_confirmada' in r && !r.comision_confirmada)}
            />
          )}
          {datos[i].map((r) => (
            <details key={String(r.id)} className="border rounded-lg p-4">
              <summary className="cursor-pointer font-semibold">
                {'nombre' in r ? String(r.nombre) : 'Configuración general'}
                {'activo' in r && !r.activo ? ' · Inactivo' : ''}
              </summary>
              <div className="mt-4">
                <FormularioRegistro
                  tabla={tabla}
                  id={r.id}
                  inicial={r as unknown as Record<string, unknown>}
                  campos={campos[tabla]}
                  editable={puede(perfil.rol, areas[tabla])}
                />
              </div>
            </details>
          ))}
          {!['parametros', 'canales'].includes(tabla) && puede(perfil.rol, areas[tabla]) && (
            <details className="border rounded-lg p-4">
              <summary className="cursor-pointer">Crear nuevo registro</summary>
              <div className="mt-4">
                <FormularioRegistro
                  tabla={tabla}
                  id={null}
                  inicial={{ orden: 0 }}
                  campos={campos[tabla]}
                  editable
                />
              </div>
            </details>
          )}
        </section>
      ))}
    </>
  );
}
