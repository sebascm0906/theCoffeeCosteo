import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  user: vi.fn(),
  perfil: vi.fn(),
  cupo: vi.fn(),
  stream: vi.fn(),
  tools: vi.fn(),
}));
vi.mock('../../lib/supabase/servidor', () => ({
  servidor: async () => ({
    auth: { getUser: m.user },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: m.perfil }) }) }),
    rpc: m.cupo,
  }),
}));
vi.mock('../../lib/chat/herramientas', () => ({ herramientasChat: m.tools }));
vi.mock('ai', async (original) => ({ ...(await original<typeof import('ai')>()), streamText: m.stream }));
import { POST } from '../../app/api/chat/route';
const cuerpo = { messages: [{ role: 'user', parts: [{ type: 'text', text: 'Consulta alertas' }] }] };
const peticion = (body: unknown = cuerpo, origin = 'https://portal.test') =>
  new Request('https://portal.test/api/chat', {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('ANTHROPIC_API_KEY', 'solo-prueba');
  m.user.mockResolvedValue({ data: { user: { id: 'usuario' } }, error: null });
  m.perfil.mockResolvedValue({ data: { activo: true }, error: null });
  m.cupo.mockResolvedValue({ data: true, error: null });
  m.tools.mockReturnValue({});
  m.stream.mockReturnValue({
    toUIMessageStreamResponse: (o: { onError: () => string }) =>
      new Response(o.onError(), { headers: { 'Cache-Control': 'no-store' } }),
  });
});
it('rechaza origen externo, sesión vencida y perfiles inactivos antes de gastar', async () => {
  expect((await POST(peticion(cuerpo, 'https://externo.test'))).status).toBe(403);
  m.user.mockResolvedValue({ data: { user: null }, error: null });
  expect((await POST(peticion())).status).toBe(401);
  m.user.mockResolvedValue({ data: { user: { id: 'u' } }, error: null });
  m.perfil.mockResolvedValue({ data: { activo: false }, error: null });
  expect((await POST(peticion())).status).toBe(403);
  expect(m.cupo).not.toHaveBeenCalled();
  expect(m.stream).not.toHaveBeenCalled();
});
it('falla cerrado si falta clave o migración y respeta la cuota', async () => {
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  expect((await POST(peticion())).status).toBe(503);
  vi.stubEnv('ANTHROPIC_API_KEY', 'solo-prueba');
  m.cupo.mockResolvedValue({ data: null, error: { message: 'detalle privado' } });
  expect((await POST(peticion())).status).toBe(503);
  m.cupo.mockResolvedValue({ data: false, error: null });
  expect((await POST(peticion())).status).toBe(429);
  expect(m.stream).not.toHaveBeenCalled();
});
it('rechaza contenido falsificado y cuerpos extensos antes de reservar', async () => {
  expect((await POST(peticion({ messages: [{ role: 'system', parts: [] }] }))).status).toBe(400);
  expect((await POST(peticion({ texto: 'x'.repeat(100001) }))).status).toBe(413);
  expect(m.cupo).not.toHaveBeenCalled();
});
it('envía únicamente texto validado, limita pasos y oculta errores del proveedor', async () => {
  const r = await POST(peticion());
  expect(r.status).toBe(200);
  expect(r.headers.get('cache-control')).toBe('no-store');
  expect(m.cupo).toHaveBeenCalledWith('reservar_consulta_chat');
  expect(m.stream.mock.calls[0][0]).toMatchObject({
    messages: [{ role: 'user', content: 'Consulta alertas' }],
    maxOutputTokens: 1800,
    maxRetries: 0,
  });
  expect(await r.text()).not.toContain('solo-prueba');
  m.stream.mockImplementation(() => {
    throw new Error('clave privada');
  });
  const error = await POST(peticion());
  expect(error.status).toBe(503);
  expect(await error.text()).not.toContain('clave privada');
});
