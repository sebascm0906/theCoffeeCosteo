import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  from: vi.fn(),
  filas: [] as Record<string, unknown>[],
  rangos: vi.fn(),
  filtro: vi.fn(),
  fuentes: {} as Record<string, Record<string, unknown>[]>,
}));
vi.mock('../../lib/mcp/autenticacion', async (original) => ({
  ...(await original<typeof import('../../lib/mcp/autenticacion')>()),
  autenticarMcp: m.auth,
}));
import { atenderMcp } from '../../lib/mcp/http';
import { GET as metadatos } from '../../app/.well-known/oauth-protected-resource/route';
import { resultadoPagina } from '../../lib/mcp/herramientas';
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://prueba.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publica');
  m.filas = [];
  m.fuentes = {};
  m.from.mockImplementation((tabla: string) => {
    const filas = m.fuentes[tabla] ?? m.filas;
    const q = {
      select: () => q,
      order: () => q,
      ilike: (...a: unknown[]) => {
        m.filtro(...a);
        return q;
      },
      eq: () => q,
      not: () => q,
      in: () => q,
      limit: () => q,
      single: async () => ({ data: filas[0] ?? null, error: null }),
      then: (resolve: (r: unknown) => unknown) => Promise.resolve({ data: filas, error: null }).then(resolve),
      range: (...a: unknown[]) => {
        m.rangos(...a);
        return Promise.resolve({ data: filas, error: null });
      },
    };
    return q;
  });
  m.auth.mockResolvedValue({ from: m.from });
});
async function rpc(method: string, params: unknown = {}, token = 'prueba') {
  return atenderMcp(
    new Request('https://the-coffee-costeo.vercel.app/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    }),
  );
}
async function mensaje(response: Response) {
  const texto = await response.text();
  return JSON.parse(
    texto.includes('data:')
      ? texto
          .split('\n')
          .find((l) => l.startsWith('data:'))!
          .slice(5)
      : texto,
  );
}
it('anónimo recibe 401 con descubrimiento sin consultar datos', async () => {
  const r = await rpc('tools/list', {}, '');
  expect(r.status).toBe(401);
  expect(r.headers.get('www-authenticate')).toContain('/.well-known/oauth-protected-resource');
  expect(m.auth).not.toHaveBeenCalled();
  const meta = await metadatos().json();
  expect(meta.resource).toBe('https://the-coffee-costeo.vercel.app/mcp');
  expect(meta.authorization_servers).toEqual(['https://prueba.supabase.co/auth/v1']);
});
it('negocia MCP y anuncia únicamente seis herramientas de lectura', async () => {
  const r = await rpc('initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'prueba', version: '1' },
  });
  expect(r.status).toBe(200);
  expect((await mensaje(r)).result.serverInfo.name).toBe('the-coffee-consultas');
  const tools = (await mensaje(await rpc('tools/list'))).result.tools;
  expect(tools).toHaveLength(6);
  expect(tools.every((t: { annotations: { readOnlyHint: boolean } }) => t.annotations.readOnlyHint)).toBe(
    true,
  );
  expect(m.from).not.toHaveBeenCalled();
});
it('pagina sin perder registros y conserva costos cero y precios ausentes desde SQL', async () => {
  m.filas = [{ costo: 0, precio_manual: null, margen_pct: null }];
  const r = await mensaje(
    await rpc('tools/call', {
      name: 'consultar_costos',
      arguments: { producto_id: '11111111-1111-4111-8111-111111111111', pagina: 2, limite: 10 },
    }),
  );
  expect(r.result.structuredContent.datos[0]).toEqual(m.filas[0]);
  expect(m.from).toHaveBeenCalledWith('v_resumen');
  expect(m.rangos).toHaveBeenCalledWith(10, 20);
  expect(resultadoPagina([1, 2, 3], 1, 2)).toEqual({ datos: [1, 2], pagina: 1, siguiente_pagina: 2 });
});
it('rechaza límites/IDs inválidos y consultas arbitrarias antes de leer la base', async () => {
  for (const params of [
    { name: 'buscar_insumos', arguments: { limite: 1000 } },
    { name: 'consultar_costos', arguments: { producto_id: 'SQL' } },
    { name: 'ejecutar_sql', arguments: { sql: 'delete from recetas' } },
  ]) {
    const r = await mensaje(await rpc('tools/call', params));
    expect(r.error || r.result?.isError).toBeTruthy();
  }
  expect(m.from).not.toHaveBeenCalled();
});
it('escapa comodines de búsqueda y no acepta orígenes ajenos', async () => {
  await rpc('tools/call', { name: 'buscar_recetas', arguments: { texto: '100%_' } });
  expect(m.filtro).toHaveBeenCalledWith('nombre', '%100\\%\\_%');
  const r = await atenderMcp(
    new Request('https://the-coffee-costeo.vercel.app/mcp', { headers: { Origin: 'https://evil.test' } }),
  );
  expect(r.status).toBe(403);
});
it('detalle asocia cantidades y componentes, con costo oficial de sub-receta', async () => {
  const receta = '11111111-1111-4111-8111-111111111111';
  m.fuentes = {
    recetas: [{ id: receta, nombre: 'Mix', tipo: 'subreceta', unidad_rendimiento: 'ml' }],
    receta_lineas: [{ id: 'l', insumo_id: 'i', subreceta_id: null, orden: 0 }],
    linea_cantidades: [{ linea_id: 'l', tamano_id: null, cantidad: 0 }],
    insumos: [{ id: 'i', nombre: 'Agua', unidad: 'ml', activo: true }],
    tamanos: [],
    v_costo_subreceta: [{ costo_unitario: 0.125, usa_inactivo: false }],
  };
  const r = await mensaje(
    await rpc('tools/call', { name: 'consultar_receta', arguments: { receta_id: receta } }),
  );
  expect(r.result.structuredContent.costo_subreceta.costo_unitario).toBe(0.125);
  expect(r.result.structuredContent.lineas.datos[0]).toMatchObject({
    componente: { nombre: 'Agua', unidad: 'ml' },
    cantidades: [{ cantidad: 0, tamano_id: null, tamano: null }],
  });
});
it('rastrea uso indirecto de un ingrediente mediante sub-recetas', async () => {
  const insumo = '11111111-1111-4111-8111-111111111111';
  m.fuentes = {
    insumos: [{ id: insumo, nombre: 'Café' }],
    recetas: [
      { id: 's', nombre: 'Mix', tipo: 'subreceta' },
      { id: 'p', nombre: 'Latte', tipo: 'producto' },
    ],
    receta_lineas: [
      { id: 'l1', receta_id: 's', insumo_id: insumo, subreceta_id: null },
      { id: 'l2', receta_id: 'p', insumo_id: null, subreceta_id: 's' },
    ],
  };
  const r = await mensaje(
    await rpc('tools/call', { name: 'recetas_por_insumo', arguments: { insumo_id: insumo } }),
  );
  expect(r.result.structuredContent.datos.map((d: { nombre: string }) => d.nombre)).toEqual(['Latte', 'Mix']);
});
it('retorna errores de consulta sin filtrar credenciales ni detalles internos', async () => {
  m.from.mockImplementation(() => {
    throw new Error('DATABASE_URL=secreto');
  });
  const r = await mensaje(await rpc('tools/call', { name: 'buscar_insumos', arguments: {} }));
  expect(r.result.isError).toBe(true);
  expect(JSON.stringify(r)).not.toContain('secreto');
});
