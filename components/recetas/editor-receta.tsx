'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { SelectorComponente, type OpcionComponente } from './selector-componente';
import type { Borrador } from '@/lib/portal/validacion';
import { validarReceta, numeroCapturado } from '@/lib/portal/validacion';
import type { Catalogo, Tamano, Unidad } from '@/lib/supabase/database.types';
import { guardarReceta } from '@/app/(portal)/productos/actions';
import { dinero } from '@/lib/portal/consultas';
export function EditorReceta({
  inicial,
  opciones,
  categorias,
  tamanos,
  editable,
  afectados = [],
}: {
  inicial: Borrador;
  opciones: OpcionComponente[];
  categorias: Catalogo[];
  tamanos: Tamano[];
  editable: boolean;
  afectados?: string[];
}) {
  const [d, setD] = useState(inicial),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(''),
    [pending, start] = useTransition();
  const router = useRouter();
  // Un refresco de precios no debe descartar captura pendiente.
  if (!dirty && d !== inicial) setD(inicial);
  const update = (patch: Partial<Borrador>) => {
    setDirty(true);
    setD((v) => ({ ...v, ...patch }));
  };
  const columna = d.tipo === 'producto' ? d.tamanos : [null];
  const linea = (i: number, patch: Partial<Borrador['lineas'][number]>) => {
    setDirty(true);
    setD((v) => ({ ...v, lineas: v.lineas.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  };
  function cambiarTamano(id: string, checked: boolean) {
    if (
      !checked &&
      !window.confirm(
        'Al quitar este tamaño se eliminan sus cantidades, precio de lista y precios manuales. ¿Continuar?',
      )
    )
      return;
    update({
      tamanos: checked ? [...d.tamanos, id] : d.tamanos.filter((t) => t !== id),
      lineas: d.lineas.map((l) => ({
        ...l,
        cantidades: checked
          ? [...l.cantidades, { tamano_id: id, cantidad: 0 }]
          : l.cantidades.filter((c) => c.tamano_id !== id),
      })),
    });
  }
  function guardar() {
    setError('');
    try {
      validarReceta(d);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    start(async () => {
      try {
        const r = await guardarReceta({
          ...d,
          nombre: d.nombre.trim(),
          lineas: d.lineas.map((l, i) => ({ ...l, orden: i })),
        });
        if (r.error) setError(r.error);
        else {
          setDirty(false);
          router.push(`/${d.tipo === 'producto' ? 'productos' : 'subrecetas'}/${r.id}`);
          router.refresh();
        }
      } catch {
        setError(
          'No se pudo guardar. Tu captura sigue aquí. Si la sesión venció, inicia sesión en otra pestaña e intenta de nuevo.',
        );
      }
    });
  }
  return (
    <section className="panel space-y-5">
      <h2>{editable ? 'Editor de receta' : 'Receta'}</h2>
      {dirty && inicial.version !== d.version && (
        <p className="aviso">
          La base tiene una versión más reciente. Tu borrador se conserva.{' '}
          <button
            type="button"
            className="underline"
            onClick={() => {
              if (window.confirm('Recargar descarta los cambios pendientes del editor. ¿Continuar?')) {
                setDirty(false);
                setD(inicial);
              }
            }}
          >
            Recargar receta
          </button>
        </p>
      )}
      <fieldset disabled={!editable || pending} className="space-y-5">
        <div className="grid md:grid-cols-3 gap-4">
          <label>
            Nombre
            <input value={d.nombre} onChange={(e) => update({ nombre: e.target.value })} />
          </label>
          {d.tipo === 'producto' ? (
            <label>
              Categoría
              <select value={d.categoria_id ?? ''} onChange={(e) => update({ categoria_id: e.target.value })}>
                <option value="">Seleccionar</option>
                {categorias
                  .filter((c) => c.activo || c.id === d.categoria_id)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                      {c.activo ? '' : ' (inactiva)'}
                    </option>
                  ))}
              </select>
            </label>
          ) : (
            <>
              <label>
                Rendimiento
                <input
                  type="number"
                  min="0.000001"
                  step="any"
                  value={d.rendimiento ?? ''}
                  onChange={(e) => update({ rendimiento: e.target.value ? Number(e.target.value) : null })}
                />
              </label>
              <label>
                Unidad de rendimiento
                <select
                  value={d.unidad_rendimiento ?? ''}
                  onChange={(e) => update({ unidad_rendimiento: e.target.value as Unidad })}
                >
                  {['gr', 'ml', 'pza'].map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </label>
            </>
          )}
        </div>
        {d.tipo === 'producto' && (
          <div className="flex flex-wrap gap-5" aria-label="Tamaños">
            {tamanos.map((t) => (
              <label key={t.id} className="flex gap-2 items-center">
                <input
                  type="checkbox"
                  className="w-auto"
                  checked={d.tamanos.includes(t.id)}
                  onChange={(e) => cambiarTamano(t.id, e.target.checked)}
                />
                {t.nombre}
              </label>
            ))}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Ingrediente / sub-receta</th>
                <th>Unidad</th>
                {columna.map((t) => (
                  <th key={t ?? 'lote'}>{tamanos.find((x) => x.id === t)?.nombre ?? 'Cantidad del lote'}</th>
                ))}
                {editable && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {d.lineas.map((l, i) => {
                const id = l.insumo_id ?? l.subreceta_id ?? '';
                const o = opciones.find((x) => x.id === id);
                return (
                  <tr key={l.id ?? i}>
                    <td className="min-w-64">
                      <SelectorComponente
                        disabled={!editable}
                        opciones={opciones}
                        value={id}
                        onChange={(id) => {
                          const nuevo = opciones.find((o) => o.id === id)!;
                          linea(i, {
                            insumo_id: nuevo.tipo === 'insumo' ? id : null,
                            subreceta_id: nuevo.tipo === 'subreceta' ? id : null,
                          });
                        }}
                      />
                      {o && !o.activo && (
                        <p className="text-amber-700 text-xs">Componente inactivo: revisa su reemplazo.</p>
                      )}
                    </td>
                    <td>{o?.unidad ?? '—'}</td>
                    {columna.map((t) => {
                      const valor = l.cantidades.find((c) => c.tamano_id === t)?.cantidad;
                      return (
                        <td key={t ?? 'lote'}>
                          <input
                            aria-label={`Cantidad línea ${i + 1} ${tamanos.find((x) => x.id === t)?.nombre ?? 'lote'}`}
                            type="number"
                            step="any"
                            min="0"
                            value={valor !== undefined && Number.isFinite(valor) ? valor : ''}
                            onChange={(e) => {
                              let valor: number;
                              try {
                                valor = numeroCapturado(e.target.value);
                              } catch {
                                valor = NaN;
                              }
                              linea(i, {
                                cantidades: [
                                  ...l.cantidades.filter((c) => c.tamano_id !== t),
                                  { tamano_id: t, cantidad: valor },
                                ],
                              });
                            }}
                          />
                        </td>
                      );
                    })}
                    {editable && (
                      <td>
                        <Button
                          type="button"
                          variant="ghost"
                          aria-label={`Quitar línea ${i + 1}`}
                          onClick={() => update({ lineas: d.lineas.filter((_, j) => j !== i) })}
                        >
                          Quitar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={i === 0}
                          aria-label={`Subir línea ${i + 1}`}
                          onClick={() => {
                            const ls = [...d.lineas];
                            [ls[i - 1], ls[i]] = [ls[i], ls[i - 1]];
                            update({ lineas: ls });
                          }}
                        >
                          ↑
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {editable && (
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              update({
                lineas: [
                  ...d.lineas,
                  {
                    insumo_id: null,
                    subreceta_id: null,
                    orden: d.lineas.length,
                    cantidades: columna.map((t) => ({ tamano_id: t, cantidad: 0 })),
                  },
                ],
              })
            }
          >
            Agregar componente
          </Button>
        )}
        <label className="flex gap-2 items-center">
          <input
            className="w-auto"
            type="checkbox"
            checked={d.activo}
            onChange={(e) => {
              if (
                !e.target.checked &&
                !window.confirm(
                  `Desactivar conserva la receta y afecta: ${afectados.join(', ') || 'sin referencias registradas'}. ¿Continuar?`,
                )
              )
                return;
              update({ activo: e.target.checked });
            }}
          />
          Receta activa
        </label>
      </fieldset>
      <div className="bg-muted p-4 rounded-lg">
        <p className="text-sm font-semibold">Estimación mientras editas</p>
        {columna.map((t) => {
          const suma = d.lineas.reduce(
            (n, l) =>
              n +
              (opciones.find((o) => o.id === (l.insumo_id ?? l.subreceta_id))?.costo ?? 0) *
                (l.cantidades.find((c) => c.tamano_id === t)?.cantidad ?? 0),
            0,
          );
          return (
            <p key={t ?? 'lote'}>
              {tamanos.find((x) => x.id === t)?.nombre ?? 'Lote'}:{' '}
              {Number.isFinite(suma) ? dinero(suma) : 'Completa cantidades'}
              {d.tipo === 'subreceta' && d.rendimiento && Number.isFinite(suma)
                ? ` · ${dinero(suma / d.rendimiento)} / ${d.unidad_rendimiento}`
                : ''}
            </p>
          );
        })}
        <p className="text-xs mt-2">Al guardar, los costos oficiales se consultan de nuevo en la base.</p>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}{' '}
          <a
            target="_blank"
            rel="noreferrer"
            className="underline"
            href={
              inicial.id ? `/${d.tipo === 'producto' ? 'productos' : 'subrecetas'}/${inicial.id}` : '/login'
            }
          >
            Abrir en otra pestaña
          </a>
        </p>
      )}
      {editable && (
        <Button disabled={pending} onClick={guardar}>
          {pending ? 'Guardando…' : 'Guardar receta completa'}
        </Button>
      )}
    </section>
  );
}
