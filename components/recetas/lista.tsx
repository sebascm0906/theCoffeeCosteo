import Link from 'next/link';
import { sesion } from '@/lib/supabase/sesion';
import { todas } from '@/lib/portal/consultas';
import { puede } from '@/lib/portal/permisos';
export async function ListaRecetas({ tipo, q = '' }: { tipo: 'producto' | 'subreceta'; q?: string }) {
  const { db, perfil } = await sesion();
  const filas = (await todas(db, 'recetas', 'nombre,id')).filter(
    (r) => r.tipo === tipo && r.nombre.toLocaleLowerCase('es').includes(q.toLocaleLowerCase('es')),
  );
  const ruta = tipo === 'producto' ? 'productos' : 'subrecetas';
  return (
    <>
      <header className="flex justify-between items-center">
        <h1>{tipo === 'producto' ? 'Productos' : 'Sub-recetas'}</h1>
        {puede(perfil.rol, 'recetas') && (
          <Link
            className="bg-primary text-white px-4 py-2 rounded-md"
            href={`/${ruta}/${tipo === 'producto' ? 'nuevo' : 'nueva'}`}
          >
            Crear {tipo === 'producto' ? 'producto' : 'sub-receta'}
          </Link>
        )}
      </header>
      <form>
        <label>
          Buscar por nombre
          <input name="q" defaultValue={q} />
        </label>
        <button className="underline mt-2">Buscar</button>
      </form>
      <div className="panel">
        <table className="tabla">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Estado</th>
              <th>Versión</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link className="underline" href={`/${ruta}/${r.id}`}>
                    {r.nombre}
                  </Link>
                </td>
                <td>{r.activo ? 'Activo' : 'Inactivo'}</td>
                <td>{r.version}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filas.length && <p>No hay resultados.</p>}
      </div>
    </>
  );
}
