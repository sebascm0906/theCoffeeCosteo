'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Resumen, Manual } from '@/lib/supabase/database.types';
import { guardarPrecio } from '@/app/(portal)/productos/precios-actions';
import { numeroCapturado } from '@/lib/portal/validacion';
import { Button } from '@/components/ui/button';
function Precio({ f, manual, notaInicial = '' }: { f: Resumen; manual: boolean; notaInicial?: string }) {
  const [valor, setValor] = useState(String((manual ? f.precio_manual : f.precio_lista) ?? '')),
    [nota, setNota] = useState(notaInicial),
    [error, setError] = useState(''),
    [pending, start] = useTransition();
  const router = useRouter();
  const guardar = () => {
    let precio: number | null;
    try {
      precio = valor.trim() ? numeroCapturado(valor) : null;
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    start(async () => {
      try {
        const r = await guardarPrecio({
          producto_id: f.producto_id,
          tamano_id: f.tamano_id,
          canal_id: manual ? f.canal_id : undefined,
          precio,
          nota,
        });
        if (r.error) setError(r.error);
        else {
          setError('');
          router.refresh();
        }
      } catch {
        setError('No se pudo guardar. Revisa la sesión y vuelve a intentar.');
      }
    });
  };
  return (
    <div className="space-y-3 border rounded-lg p-4">
      <label>
        {f.tamano} · {manual ? `${f.canal} manual` : 'Precio de lista'}
        <input type="number" min="0.01" step="any" value={valor} onChange={(e) => setValor(e.target.value)} />
      </label>
      {manual && (
        <label>
          Nota
          <input value={nota} onChange={(e) => setNota(e.target.value)} />
        </label>
      )}
      <p className="text-xs text-muted-foreground">
        {manual
          ? 'Vacío retira el precio manual y vuelve al calculado.'
          : 'Vacío deja el producto sin precio de lista.'}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <Button disabled={pending} onClick={guardar}>
        {pending ? 'Guardando…' : 'Guardar precio'}
      </Button>
    </div>
  );
}
export function EditorPrecios({
  filas,
  editable,
  manuales = [],
}: {
  filas: Resumen[];
  editable: boolean;
  manuales?: Manual[];
}) {
  if (!editable) return null;
  return (
    <section className="panel space-y-4">
      <h2>Precios · Finanzas</h2>
      <div className="grid md:grid-cols-3 gap-4">
        {filas
          .filter((f) => f.canal === 'Mostrador')
          .map((f) => (
            <Precio key={`lista:${f.tamano_id}:${f.precio_lista}`} f={f} manual={false} />
          ))}
        {filas
          .filter((f) => f.regla_precio === 'castigado')
          .map((f) => (
            <Precio
              key={`manual:${f.tamano_id}:${f.canal_id}:${f.precio_manual}`}
              f={f}
              manual
              notaInicial={
                manuales.find(
                  (m) =>
                    m.producto_id === f.producto_id &&
                    m.tamano_id === f.tamano_id &&
                    m.canal_id === f.canal_id,
                )?.nota ?? ''
              }
            />
          ))}
      </div>
    </section>
  );
}
