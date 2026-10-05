'use client';
import { useState, useTransition } from 'react';
import type { Bitacora } from '@/lib/supabase/database.types';
import { historialReceta } from '@/app/(portal)/productos/historial-actions';
import { Button } from '@/components/ui/button';
export function HistorialReceta({
  id,
  inicial,
  usuarios = {},
}: {
  id: string;
  inicial: Bitacora[];
  usuarios?: Record<string, string>;
}) {
  const [filas, setFilas] = useState(inicial),
    [mas, setMas] = useState(inicial.length === 50),
    [error, setError] = useState(''),
    [pending, start] = useTransition();
  function cargar() {
    start(async () => {
      try {
        const data = await historialReceta(id, filas[filas.length - 1].id);
        setFilas([...filas, ...data]);
        setMas(data.length === 50);
        setError('');
      } catch {
        setError('No se pudo cargar el historial. Intenta de nuevo.');
      }
    });
  }
  return (
    <section className="panel space-y-4">
      <h2>Historial de la receta</h2>
      <p className="text-xs text-muted-foreground">
        El historial importado del Excel sin vínculo con esta receta no se atribuye aquí.
      </p>
      <div className="overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Usuario</th>
              <th>Tabla / campo</th>
              <th>Anterior</th>
              <th>Nuevo</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((h) => (
              <tr key={h.id}>
                <td>{new Date(h.fecha).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}</td>
                <td>
                  {h.usuario_id
                    ? (usuarios[h.usuario_id] ?? 'Usuario sin perfil actual')
                    : h.origen === 'migracion'
                      ? 'Migración'
                      : 'Sin usuario registrado'}
                </td>
                <td>
                  {h.tabla} / {h.campo}
                </td>
                <td className="max-w-xs break-all">{h.valor_anterior ?? '—'}</td>
                <td className="max-w-xs break-all">{h.valor_nuevo ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filas.length && <p>Sin cambios registrados.</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {mas && (
        <Button disabled={pending} variant="outline" onClick={cargar}>
          {pending ? 'Cargando…' : 'Ver cambios anteriores'}
        </Button>
      )}
    </section>
  );
}
