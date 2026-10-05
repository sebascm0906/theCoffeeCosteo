'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';
import type { Resumen, Alerta } from '@/lib/supabase/database.types';
import { dinero, porcentaje } from '@/lib/portal/consultas';
import { Button } from '@/components/ui/button';
type Fila = Resumen & { alerta: string | null };
const columns: ColumnDef<Fila>[] = [
  {
    accessorKey: 'producto',
    header: 'Producto',
    cell: ({ row }) => (
      <Link className="underline font-medium" href={`/productos/${row.original.producto_id}`}>
        {row.original.producto}
      </Link>
    ),
  },
  { accessorKey: 'categoria', header: 'Categoría' },
  { accessorKey: 'tamano', header: 'Tamaño' },
  { accessorKey: 'canal', header: 'Canal' },
  { accessorKey: 'costo', header: 'Costo', cell: ({ row }) => dinero(row.original.costo) },
  {
    accessorKey: 'precio_canal',
    header: 'Precio',
    cell: ({ row }) => (
      <>
        {dinero(row.original.precio_canal)}
        {row.original.precio_manual !== null && <small className="block">Manual</small>}
      </>
    ),
  },
  {
    accessorKey: 'margen_pct',
    header: 'Margen',
    cell: ({ row }) => (
      <span
        className={
          row.original.margen_pct !== null && row.original.margen_pct < row.original.margen_objetivo
            ? 'text-red-700'
            : 'text-primary'
        }
      >
        {porcentaje(row.original.margen_pct)}
      </span>
    ),
  },
  {
    accessorKey: 'alerta',
    header: 'Alerta del producto/canal',
    cell: ({ row }) => row.original.alerta ?? '—',
  },
];
export function TablaResumen({
  filas,
  alertas,
  filtros = {},
}: {
  filas: Resumen[];
  alertas: Alerta[];
  filtros?: Record<string, string | undefined>;
}) {
  const [buscar, setBuscar] = useState(filtros.buscar ?? ''),
    [categoria, setCategoria] = useState(filtros.categoria ?? ''),
    [canal, setCanal] = useState(filtros.canal ?? ''),
    [tamano, setTamano] = useState(filtros.tamano ?? ''),
    [alerta, setAlerta] = useState(filtros.alerta ?? ''),
    [estado, setEstado] = useState(filtros.estado ?? 'activos');
  function cambiar(clave: string, setter: (value: string) => void) {
    return (value: string) => {
      setter(value);
      const params = new URLSearchParams(window.location.search);
      if (value) params.set(clave, value);
      else params.delete(clave);
      window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
    };
  }
  const data = useMemo(() => {
    const mapa = new Map(alertas.map((a) => [`${a.producto_id}:${a.canal_id}`, a.alerta]));
    return filas
      .map((f) => ({ ...f, alerta: mapa.get(`${f.producto_id}:${f.canal_id}`) ?? null }))
      .filter(
        (f) =>
          f.producto.toLocaleLowerCase('es').includes(buscar.toLocaleLowerCase('es')) &&
          (!categoria || f.categoria === categoria) &&
          (!canal || f.canal === canal) &&
          (!tamano || f.tamano === tamano) &&
          (!alerta || f.alerta === alerta) &&
          (estado === 'todos' || f.activo === (estado === 'activos')),
      );
  }, [filas, alertas, buscar, categoria, canal, tamano, alerta, estado]);
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <label>
          Buscar producto
          <input
            value={buscar}
            onChange={(e) => cambiar('buscar', setBuscar)(e.target.value)}
            placeholder="Nombre…"
          />
        </label>
        {(
          [
            ['Categoría', categoria, cambiar('categoria', setCategoria), filas.map((f) => f.categoria)],
            ['Canal', canal, cambiar('canal', setCanal), filas.map((f) => f.canal)],
            ['Tamaño', tamano, cambiar('tamano', setTamano), filas.map((f) => f.tamano)],
            [
              'Alerta',
              alerta,
              cambiar('alerta', setAlerta),
              alertas.flatMap((a) => (a.alerta ? [a.alerta] : [])),
            ],
          ] as const
        ).map(([nombre, valor, setter, valores]) => (
          <label key={nombre}>
            {nombre}
            <select value={valor} onChange={(e) => setter(e.target.value)}>
              <option value="">Todos</option>
              {[...new Set(valores)].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        ))}
        <label>
          Estado
          <select value={estado} onChange={(e) => cambiar('estado', setEstado)(e.target.value)}>
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
            <option value="todos">Todos</option>
          </select>
        </label>
      </div>
      <p className="text-sm text-muted-foreground">{data.length} filas de producto × tamaño × canal</p>
      <div className="panel overflow-x-auto p-0">
        <table className="tabla">
          <thead>
            {table.getHeaderGroups().map((g) => (
              <tr key={g.id}>
                {g.headers.map((h) => (
                  <th key={h.id}>{flexRender(h.column.columnDef.header, h.getContext())}</th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr key={r.id}>
                {r.getVisibleCells().map((c) => (
                  <td key={c.id}>{flexRender(c.column.columnDef.cell, c.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!data.length && <p className="p-5">No hay resultados con estos filtros.</p>}
      </div>
      <div className="flex items-center gap-4">
        <Button variant="outline" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
          Anterior
        </Button>
        <span>
          Página {table.getState().pagination.pageIndex + 1} de {Math.max(1, table.getPageCount())}
        </span>
        <Button variant="outline" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
          Siguiente
        </Button>
      </div>
    </div>
  );
}
