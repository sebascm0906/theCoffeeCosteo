import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  rol: 'admin',
  update: vi.fn(),
  insert: vi.fn(),
  upsert: vi.fn(),
  remove: vi.fn(),
  rpc: vi.fn(),
  sesion: vi.fn(),
  result: { data: [{ id: 'r' }], error: null as null | { code: string; message: string } },
  regla: 'castigado',
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../../lib/supabase/sesion', () => ({
  sesion: async (area?: string, redirigir?: boolean) => {
    m.sesion(area, redirigir);
    if (area && m.rol !== 'admin' && m.rol !== 'finanzas') throw new Error('No tienes permiso');
    const q = { eq: vi.fn().mockReturnThis(), select: async () => m.result };
    return {
      perfil: { rol: m.rol },
      db: {
        rpc: m.rpc,
        from: (tabla: string) =>
          tabla === 'canales'
            ? {
                select: () => ({
                  eq: () => ({ single: async () => ({ data: { regla_precio: m.regla }, error: null }) }),
                }),
                update: (d: unknown) => {
                  m.update(d);
                  return q;
                },
              }
            : {
                update: (d: unknown) => {
                  m.update(d);
                  return q;
                },
                insert: (d: unknown) => {
                  m.insert(d);
                  return q;
                },
                upsert: (d: unknown) => {
                  m.upsert(d);
                  return q;
                },
                delete: () => {
                  m.remove();
                  return q;
                },
              },
      },
    };
  },
}));
import { guardarRegistro } from '../../app/(portal)/configuracion/actions';
import { guardarPrecio } from '../../app/(portal)/productos/precios-actions';
import { guardarReceta } from '../../app/(portal)/productos/actions';
beforeEach(() => {
  vi.clearAllMocks();
  m.rol = 'admin';
  m.result = { data: [{ id: 'r' }], error: null };
  m.regla = 'castigado';
});
it('rechaza tabla ajena, rol incorrecto y creación de canales', async () => {
  expect((await guardarRegistro('bitacora' as never, null, {})).error).toContain('permiso');
  m.rol = 'compras';
  expect((await guardarRegistro('parametros', 1, { iva: 0.16, margen_objetivo: 0.55 })).error).toContain(
    'permiso',
  );
  m.rol = 'admin';
  expect((await guardarRegistro('canales', null, {})).error).toContain('adicionales');
  expect(m.insert).not.toHaveBeenCalled();
  expect(m.update).not.toHaveBeenCalled();
});
it('no escribe campos técnicos ni interpreta ausencia de filas como éxito', async () => {
  m.result = { data: [], error: null };
  const r = await guardarRegistro('parametros', 1, {
    iva: 0.16,
    margen_objetivo: 0.55,
    updated_by: 'otro',
    id: 2,
  });
  expect(m.update).toHaveBeenCalledWith({ iva: 0.16, margen_objetivo: 0.55 });
  expect(r.error).toContain('no existe');
  expect(m.sesion).toHaveBeenCalledWith(undefined, false);
});
it('Finanzas cambia solo precio; manual no disponible en canal mostrador', async () => {
  m.rol = 'finanzas';
  await guardarPrecio({ producto_id: 'p', tamano_id: 't', precio: 60 });
  expect(m.update).toHaveBeenCalledWith({ precio_lista: 60 });
  m.regla = 'mostrador';
  expect(
    (await guardarPrecio({ producto_id: 'p', tamano_id: 't', canal_id: 'c', precio: 70 })).error,
  ).toContain('no acepta');
  expect(m.upsert).not.toHaveBeenCalled();
});
it('retirar manual comprueba resultado y receta transmite conflicto sin revalidar', async () => {
  m.result = { data: [], error: null };
  expect(
    (await guardarPrecio({ producto_id: 'p', tamano_id: 't', canal_id: 'c', precio: null })).error,
  ).toContain('No se encontró');
  m.rpc.mockResolvedValueOnce({ data: null, error: { code: '40001', message: 'cambió' } });
  const r = await guardarReceta({
    id: 'r',
    version: 1,
    nombre: 'Mix',
    tipo: 'subreceta',
    categoria_id: null,
    rendimiento: 100,
    unidad_rendimiento: 'ml',
    activo: true,
    tamanos: [],
    lineas: [],
  });
  expect(r.error).toContain('borrador');
});
