import { beforeEach, expect, it, vi } from 'vitest';
import { idAutorizacion, retornoClaude } from '../../lib/mcp/consentimiento';
const m = vi.hoisted(() => ({
  sesion: vi.fn(),
  detalles: vi.fn(),
  aprobar: vi.fn(),
  denegar: vi.fn(),
  login: vi.fn(),
}));
vi.mock('../../lib/supabase/sesion', () => ({ sesion: m.sesion }));
vi.mock('../../lib/supabase/servidor', () => ({
  servidor: async () => ({ auth: { signInWithPassword: m.login } }),
}));
vi.mock('next/navigation', () => ({
  redirect: (ruta: string) => {
    throw new Error(`REDIRECT:${ruta}`);
  },
}));
import { decidir } from '../../app/oauth/consent/actions';
import { entrar } from '../../app/(auth)/login/actions';
beforeEach(() => {
  vi.clearAllMocks();
  m.sesion.mockResolvedValue({
    db: {
      rpc: async () => ({ data: true, error: null }),
      auth: {
        oauth: {
          getAuthorizationDetails: m.detalles,
          approveAuthorization: m.aprobar,
          denyAuthorization: m.denegar,
        },
      },
    },
  });
  m.detalles.mockResolvedValue({
    data: { authorization_id: 'abc', redirect_uri: 'https://claude.ai/api/mcp/auth_callback' },
    error: null,
  });
  m.aprobar.mockResolvedValue({
    data: { redirect_url: 'https://claude.ai/api/mcp/auth_callback?code=abc' },
    error: null,
  });
  m.denegar.mockResolvedValue({
    data: { redirect_url: 'https://claude.ai/api/mcp/auth_callback?error=access_denied' },
    error: null,
  });
  m.login.mockResolvedValue({ error: null });
});
it('acepta solamente retornos exactos de Claude y IDs válidos', () => {
  expect(retornoClaude('https://claude.com/api/mcp/auth_callback?code=abc')).toContain('claude.com');
  for (const url of [
    'https://claude.ai.evil.test/api/mcp/auth_callback',
    'https://evil.test',
    'https://claude.ai/otro',
    'https://user:password@claude.ai/api/mcp/auth_callback',
  ])
    expect(() => retornoClaude(url)).toThrow();
  expect(() => idAutorizacion('../otro')).toThrow();
});
it('verifica perfil antes de aprobar o denegar y usa únicamente datos de Supabase para retornar', async () => {
  const f = new FormData();
  f.set('authorization_id', 'abc');
  f.set('decision', 'aceptar');
  await expect(decidir(f)).rejects.toThrow('REDIRECT:https://claude.ai/api/mcp/auth_callback?code=abc');
  expect(m.sesion).toHaveBeenCalledWith(undefined, false);
  f.set('decision', 'rechazar');
  await expect(decidir(f)).rejects.toThrow('access_denied');
  expect(m.denegar).toHaveBeenCalled();
  m.sesion.mockRejectedValue(new Error('Perfil inactivo'));
  await expect(decidir(f)).rejects.toThrow('Perfil inactivo');
  expect(m.denegar).toHaveBeenCalledTimes(1);
});
it('rechaza callback ajeno incluso al aprobar', async () => {
  m.detalles.mockResolvedValue({
    data: { authorization_id: 'abc', redirect_uri: 'https://evil.test' },
    error: null,
  });
  const f = new FormData();
  f.set('authorization_id', 'abc');
  f.set('decision', 'aceptar');
  await expect(decidir(f)).rejects.toThrow('permitido');
  expect(m.aprobar).not.toHaveBeenCalled();
});
it('el login conserva el retorno del consentimiento y rechaza redirecciones externas', async () => {
  const f = new FormData();
  f.set('email', 'cuenta@prueba.mx');
  f.set('password', 'prueba');
  f.set('next', '/oauth/consent?authorization_id=abc');
  await expect(entrar('', f)).rejects.toThrow('REDIRECT:/oauth/consent?authorization_id=abc');
  f.set('next', '//evil.test');
  await expect(entrar('', f)).rejects.toThrow('REDIRECT:/');
});
it('no autoriza antes de publicar las restricciones de base', async () => {
  m.sesion.mockResolvedValue({ db: { rpc: async () => ({ data: null, error: { message: 'missing' } }) } });
  const f = new FormData();
  f.set('authorization_id', 'abc');
  f.set('decision', 'aceptar');
  await expect(decidir(f)).rejects.toThrow('migración');
  expect(m.aprobar).not.toHaveBeenCalled();
  expect(m.detalles).not.toHaveBeenCalled();
});
