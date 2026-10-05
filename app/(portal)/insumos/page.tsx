import { sesion } from '@/lib/supabase/sesion';
import { todas, dinero } from '@/lib/portal/consultas';
import { campos } from '@/lib/portal/configuracion';
import { puede } from '@/lib/portal/permisos';
import { dependientes } from '@/lib/portal/dependencias';
import { FormularioRegistro } from '@/components/portal/formulario-registro';
export default async function InsumosPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    uso?: string;
    estado?: string;
    proveedor?: string;
    categoria?: string;
    pagina?: string;
  }>;
}) {
  const p = await searchParams;
  const { db, perfil } = await sesion();
  const [insumos, proveedores, categorias, lineas, recetas] = await Promise.all([
    todas(db, 'insumos', 'nombre,id'),
    todas(db, 'proveedores', 'nombre,id'),
    todas(db, 'categorias_insumo', 'nombre,id'),
    todas(db, 'receta_lineas', 'id'),
    todas(db, 'recetas', 'id'),
  ]);
  const permisos = puede(perfil.rol, 'insumos');
  const usos = new Map(insumos.map((i) => [i.id, dependientes(lineas, recetas, i.id, 'insumo')]));
  const filtrados = insumos.filter(
    (i) =>
      i.nombre.toLocaleLowerCase('es').includes((p.q ?? '').toLocaleLowerCase('es')) &&
      (p.uso !== 'sin' || !usos.get(i.id)?.length) &&
      (p.estado === 'todos' || i.activo === (p.estado !== 'inactivos')) &&
      (!p.proveedor || i.proveedor_id === p.proveedor) &&
      (!p.categoria || i.categoria_id === p.categoria),
  );
  const paginas = Math.max(1, Math.ceil(filtrados.length / 25));
  const pagina = Math.min(paginas, Math.max(1, Number(p.pagina) || 1));
  const paginaHref = (n: number) =>
    `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(p).filter((e): e is [string, string] => typeof e[1] === 'string')), pagina: String(n) })}`;
  const camposInsumo = (actual?: (typeof insumos)[number]) =>
    campos.insumos.map((c) =>
      c.nombre === 'proveedor_id' || c.nombre === 'categoria_id'
        ? {
            ...c,
            opciones: (c.nombre === 'proveedor_id' ? proveedores : categorias)
              .filter((x) => x.activo || x.id === actual?.[c.nombre as 'proveedor_id' | 'categoria_id'])
              .map((x) => ({ id: x.id, nombre: x.nombre + (x.activo ? '' : ' (inactivo)') })),
          }
        : c,
    );
  return (
    <>
      <h1>Insumos</h1>
      <form className="grid md:grid-cols-3 gap-4">
        <label>
          Buscar
          <input name="q" defaultValue={p.q} />
        </label>
        <label>
          Uso
          <select name="uso" defaultValue={p.uso}>
            <option value="">Todos</option>
            <option value="sin">Sin uso</option>
          </select>
        </label>
        <label>
          Estado
          <select name="estado" defaultValue={p.estado}>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
            <option value="todos">Todos</option>
          </select>
        </label>
        <label>
          Proveedor
          <select name="proveedor" defaultValue={p.proveedor}>
            <option value="">Todos</option>
            {proveedores.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Categoría
          <select name="categoria" defaultValue={p.categoria}>
            <option value="">Todas</option>
            {categorias.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nombre}
              </option>
            ))}
          </select>
        </label>
        <button className="underline">Aplicar filtros</button>
      </form>
      {permisos && (
        <details className="panel">
          <summary className="cursor-pointer font-semibold">Crear insumo</summary>
          <div className="mt-4">
            <FormularioRegistro
              tabla="insumos"
              id={null}
              inicial={{ unidad: 'gr', activo: true }}
              campos={camposInsumo()}
              editable
            />
          </div>
        </details>
      )}
      <p>{filtrados.length} insumos</p>
      {filtrados.slice((pagina - 1) * 25, pagina * 25).map((i) => (
        <details key={`${i.id}:${i.updated_at}`} className="panel">
          <summary className="cursor-pointer">
            <span className="font-semibold">{i.nombre}</span> · {dinero(i.costo_unitario)} / {i.unidad} ·{' '}
            {usos.get(i.id)?.filter((r) => r.tipo === 'producto').length ?? 0} productos{' '}
            {i.activo ? '' : '· Inactivo'}
          </summary>
          <div className="mt-5 space-y-4">
            <FormularioRegistro
              tabla="insumos"
              id={i.id}
              inicial={i as unknown as Record<string, unknown>}
              campos={camposInsumo(i)}
              editable={permisos}
              impacto={usos.get(i.id)?.map((r) => r.nombre)}
            />
            <p className="text-sm text-muted-foreground">
              Usado en:{' '}
              {usos
                .get(i.id)
                ?.map((r) => r.nombre)
                .join(', ') || 'Sin uso'}
            </p>
          </div>
        </details>
      ))}
      {!filtrados.length && <p>No hay resultados.</p>}
      <nav className="flex gap-4" aria-label="Páginas de insumos">
        {pagina > 1 && (
          <a className="underline" href={paginaHref(pagina - 1)}>
            Anterior
          </a>
        )}
        <span>
          Página {pagina} de {paginas}
        </span>
        {pagina < paginas && (
          <a className="underline" href={paginaHref(pagina + 1)}>
            Siguiente
          </a>
        )}
      </nav>
    </>
  );
}
