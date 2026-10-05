'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { guardarRegistro } from '@/app/(portal)/configuracion/actions';
import type { TablaEditable, Campo } from '@/lib/portal/configuracion';
import { numeroCapturado } from '@/lib/portal/validacion';
import { Button } from '@/components/ui/button';
export function FormularioRegistro({
  tabla,
  id,
  inicial,
  campos,
  editable,
  impacto = [],
}: {
  tabla: TablaEditable;
  id: string | number | null;
  inicial: Record<string, unknown>;
  campos: Campo[];
  editable: boolean;
  impacto?: string[];
}) {
  const [d, setD] = useState<Record<string, unknown>>(
      Object.fromEntries(
        campos.map((c) => [
          c.nombre,
          c.tipo === 'porcentaje' && inicial[c.nombre] !== null && inicial[c.nombre] !== undefined
            ? String(Number(inicial[c.nombre]) * 100)
            : (inicial[c.nombre] ?? (c.tipo === 'booleano' ? true : '')),
        ]),
      ),
    ),
    [error, setError] = useState(''),
    [pending, start] = useTransition();
  const router = useRouter();
  function guardar() {
    const valores: Record<string, unknown> = {};
    try {
      for (const c of campos) {
        const v = d[c.nombre];
        valores[c.nombre] =
          c.tipo === 'numero' || c.tipo === 'porcentaje'
            ? c.nullable && String(v).trim() === ''
              ? null
              : numeroCapturado(String(v)) / (c.tipo === 'porcentaje' ? 100 : 1)
            : v;
      }
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    start(async () => {
      try {
        const r = await guardarRegistro(tabla, id, valores);
        if (r.error) setError(r.error);
        else {
          setError('Guardado.');
          router.refresh();
          if (id === null)
            setD(Object.fromEntries(campos.map((c) => [c.nombre, c.tipo === 'booleano' ? true : ''])));
        }
      } catch {
        setError('No se pudo guardar. Revisa la sesión e intenta de nuevo; tu captura se conserva.');
      }
    });
  }
  return (
    <div className="space-y-4">
      <fieldset disabled={!editable || pending} className="grid md:grid-cols-3 gap-4">
        {campos.map((c) => (
          <label key={c.nombre}>
            {c.tipo === 'booleano' ? (
              <span className="flex gap-2 items-center">
                <input
                  type="checkbox"
                  className="w-auto"
                  checked={Boolean(d[c.nombre])}
                  onChange={(e) => {
                    if (
                      c.nombre === 'activo' &&
                      !e.target.checked &&
                      !window.confirm(
                        `Desactivar afecta: ${impacto.join(', ') || 'los registros que usan este catálogo'}. ¿Continuar?`,
                      )
                    )
                      return;
                    setD({ ...d, [c.nombre]: e.target.checked });
                  }}
                />
                {c.etiqueta}
              </span>
            ) : (
              <>
                {c.etiqueta}
                {c.tipo === 'selector' ? (
                  <select
                    value={String(d[c.nombre])}
                    onChange={(e) => setD({ ...d, [c.nombre]: e.target.value })}
                  >
                    <option value="">Seleccionar</option>
                    {c.opciones?.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nombre}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={c.tipo === 'texto' ? 'text' : 'number'}
                    step="any"
                    value={String(d[c.nombre] ?? '')}
                    onChange={(e) => setD({ ...d, [c.nombre]: e.target.value })}
                  />
                )}
              </>
            )}
          </label>
        ))}
      </fieldset>
      {error && (
        <p role="status" className={error === 'Guardado.' ? 'text-primary' : 'error'}>
          {error}
        </p>
      )}
      {editable && (
        <Button onClick={guardar} disabled={pending}>
          {pending ? 'Guardando…' : id === null ? 'Crear' : 'Guardar cambios'}
        </Button>
      )}
    </div>
  );
}
