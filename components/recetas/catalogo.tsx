'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowUpRight, Search, Plus, Coffee } from 'lucide-react';
import { Button } from '@/components/ui/button';
export type RecetaCatalogo = { id: string; nombre: string; activo: boolean };
export function CatalogoRecetas({
  filas,
  tipo,
  editable,
  consulta = '',
}: {
  filas: RecetaCatalogo[];
  tipo: 'producto' | 'subreceta';
  editable: boolean;
  consulta?: string;
}) {
  const [buscar, setBuscar] = useState(consulta);
  const [estado, setEstado] = useState('todos');
  const [pagina, setPagina] = useState(0);
  const ruta = tipo === 'producto' ? '/productos' : '/subrecetas';
  const filtradas = filas.filter(
    (r) =>
      r.nombre.toLocaleLowerCase('es').includes(buscar.trim().toLocaleLowerCase('es')) &&
      (estado === 'todos' || r.activo === (estado === 'activos')),
  );
  const paginas = Math.max(1, Math.ceil(filtradas.length / 25));
  const actual = Math.min(pagina, paginas - 1);
  const inicio = actual * 25;
  return (
    <>
      <header className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <p className="text-xs uppercase tracking-[.2em] text-muted-foreground mb-2">Catálogo de recetas</p>
          <h1>{tipo === 'producto' ? 'Productos' : 'Sub-recetas'}</h1>
          <p className="text-muted-foreground text-sm mt-2">
            {tipo === 'producto'
              ? 'Consulta y administra las recetas de tu menú.'
              : 'Organiza las preparaciones que comparten tus productos.'}
          </p>
        </div>
        {editable && (
          <Button asChild size="lg">
            <Link href={`${ruta}/${tipo === 'producto' ? 'nuevo' : 'nueva'}`}>
              <Plus aria-hidden="true" />
              Crear {tipo === 'producto' ? 'producto' : 'sub-receta'}
            </Link>
          </Button>
        )}
      </header>
      <section className="panel !p-0 overflow-hidden" aria-label="Catálogo">
        <div className="flex flex-col sm:flex-row gap-4 p-5 border-b">
          <div className="flex-1">
            <label htmlFor="buscar-recetas" className="sr-only">
              Buscar por nombre
            </label>
            <div className="relative">
              <Search
                size={18}
                aria-hidden="true"
                className="absolute left-3 top-3.5 text-muted-foreground"
              />
              <input
                id="buscar-recetas"
                type="search"
                value={buscar}
                placeholder="Buscar por nombre…"
                className="!pl-10 !rounded-lg"
                onChange={(e) => {
                  setBuscar(e.target.value);
                  setPagina(0);
                }}
              />
            </div>
          </div>
          <div className="sm:w-44">
            <label htmlFor="estado-recetas" className="sr-only">
              Estado
            </label>
            <select
              id="estado-recetas"
              value={estado}
              className="!rounded-lg"
              onChange={(e) => {
                setEstado(e.target.value);
                setPagina(0);
              }}
            >
              <option value="todos">Todos los estados</option>
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="tabla [&_td]:py-2">
            <caption className="sr-only">
              {tipo === 'producto' ? 'Productos' : 'Sub-recetas'} y su estado
            </caption>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col" className="w-36">
                  Estado
                </th>
                <th scope="col" className="w-12">
                  <span className="sr-only">Detalle</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtradas.slice(inicio, inicio + 25).map((r) => (
                <tr key={r.id} className="group hover:bg-muted/50">
                  <td>
                    <Link
                      href={`${ruta}/${r.id}`}
                      className="inline-flex items-center gap-3 font-medium hover:underline"
                    >
                      <span className="hidden sm:grid size-7 place-items-center bg-muted rounded-lg text-muted-foreground">
                        <Coffee size={16} aria-hidden="true" />
                      </span>
                      {r.nombre}
                    </Link>
                  </td>
                  <td>
                    <span
                      className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${r.activo ? 'bg-neutral-100 text-neutral-800' : 'border text-neutral-500'}`}
                    >
                      <span
                        aria-hidden="true"
                        className={`size-1.5 rounded-full ${r.activo ? 'bg-black' : 'bg-neutral-400'}`}
                      />
                      {r.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <Link
                      href={`${ruta}/${r.id}`}
                      aria-label={`Abrir ${r.nombre}`}
                      className="inline-flex p-2 rounded-md hover:bg-muted"
                    >
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtradas.length && (
          <div className="text-center py-14 px-5">
            <p className="font-semibold">No hay resultados</p>
            <p className="text-sm text-muted-foreground mt-2">
              Prueba otro nombre o cambia el filtro de estado.
            </p>
          </div>
        )}
        <footer className="flex flex-wrap items-center justify-between gap-3 p-5 text-sm">
          <p role="status" className="text-muted-foreground">
            {filtradas.length
              ? `${inicio + 1}–${Math.min(inicio + 25, filtradas.length)} de ${filtradas.length}`
              : '0 resultados'}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" disabled={actual === 0} onClick={() => setPagina(actual - 1)}>
              Anterior
            </Button>
            <span className="text-xs text-muted-foreground">
              {actual + 1} / {paginas}
            </span>
            <Button variant="outline" disabled={actual + 1 === paginas} onClick={() => setPagina(actual + 1)}>
              Siguiente
            </Button>
          </div>
        </footer>
      </section>
    </>
  );
}
