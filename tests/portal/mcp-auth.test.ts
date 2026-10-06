import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  claims: vi.fn(),
  user: vi.fn(),
  perfil: vi.fn(),
  rpc: vi.fn(),
  crear: vi.fn(),
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => {
    m.crear(...args);
    return {
      auth: { getClaims: m.claims, getUser: m.user },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: m.perfil }) }) }),
      rpc: m.rpc,
    };
  },
}));
import { autenticarMcp } from '../../lib/mcp/autenticacion';
const claims = {
  iss: 'https://prueba.supabase.co/auth/v1',
  aud: 'authenticated',
  role: 'authenticated',
  sub: 'u',
  client_id: 'cliente',
  exp: Math.floor(Date.now() / 1000) + 3600,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://prueba.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publica');
  m.claims.mockResolvedValue({ data: { claims }, error: null });
  m.user.mockResolvedValue({ data: { user: { id: 'u' } }, error: null });
  m.perfil.mockResolvedValue({ data: { activo: true }, error: null });
  m.rpc.mockResolvedValue({ data: true, error: null });
});
it('crea un cliente aislado con token verificado y perfil activo', async () => {
  await autenticarMcp('token');
  expect(m.claims).toHaveBeenCalledWith('token');
  expect(m.user).toHaveBeenCalledWith('token');
  expect(m.crear).toHaveBeenCalledWith(
    'https://prueba.supabase.co',
    'publica',
    expect.objectContaining({ global: { headers: { Authorization: 'Bearer token' } } }),
  );
});
it('rechaza token inválido, de otro proyecto, otra audiencia, sin cliente o vencido', async () => {
  for (const cambio of [
    { iss: 'https://otro.supabase.co/auth/v1' },
    { aud: 'otro' },
    { role: 'service_role' },
    { client_id: null },
    { exp: 1 },
  ]) {
    m.claims.mockResolvedValue({ data: { claims: { ...claims, ...cambio } }, error: null });
    await expect(autenticarMcp('token')).rejects.toMatchObject({ estado: 401 });
  }
  m.claims.mockResolvedValue({ data: null, error: { message: 'JWT inválido' } });
  await expect(autenticarMcp('token')).rejects.toMatchObject({ estado: 401 });
  expect(m.perfil).not.toHaveBeenCalled();
});
it('rechaza identidad inconsistente y perfil ausente/inactivo', async () => {
  m.user.mockResolvedValue({ data: { user: { id: 'otro' } }, error: null });
  await expect(autenticarMcp('token')).rejects.toMatchObject({ estado: 401 });
  m.user.mockResolvedValue({ data: { user: { id: 'u' } }, error: null });
  for (const data of [null, { activo: false }]) {
    m.perfil.mockResolvedValue({ data, error: null });
    await expect(autenticarMcp('token')).rejects.toMatchObject({ estado: 403 });
  }
});
it('falla cerrado si la migración de solo lectura no está publicada', async () => {
  m.rpc.mockResolvedValue({ data: null, error: { message: 'function missing' } });
  await expect(autenticarMcp('token')).rejects.toMatchObject({ estado: 503 });
});
