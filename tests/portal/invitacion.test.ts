import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m = vi.hoisted(() => ({ verify: vi.fn(), exchange: vi.fn() }));
vi.mock('../../lib/supabase/servidor', () => ({
  servidor: async () => ({ auth: { verifyOtp: m.verify, exchangeCodeForSession: m.exchange } }),
}));
import { GET } from '../../app/auth/confirm/route';
beforeEach(() => {
  vi.clearAllMocks();
  m.verify.mockResolvedValue({ error: null });
  m.exchange.mockResolvedValue({ error: null });
});
it('confirma cuenta invitada y dirige a establecer contraseña', async () => {
  const r = await GET(new NextRequest('http://localhost/auth/confirm?token_hash=t&type=invite'));
  expect(m.verify).toHaveBeenCalledWith({ token_hash: 't', type: 'invite' });
  expect(r.headers.get('location')).toBe('http://localhost/establecer-contrasena');
});
it('no crea cuentas y rechaza token vencido o tipo de registro', async () => {
  m.verify.mockResolvedValue({ error: { message: 'expired' } });
  expect(
    (await GET(new NextRequest('http://localhost/auth/confirm?token_hash=t&type=invite'))).headers.get(
      'location',
    ),
  ).toContain('aviso=enlace');
  expect(
    (await GET(new NextRequest('http://localhost/auth/confirm?token_hash=t&type=signup'))).headers.get(
      'location',
    ),
  ).toContain('aviso=enlace');
  expect(m.verify).toHaveBeenCalledTimes(1);
});
it('acepta PKCE pero evita redirección externa incluso con tabuladores', async () => {
  for (const next of ['//evil.test', '/\t/evil.test']) {
    const r = await GET(
      new NextRequest(`http://localhost/auth/confirm?code=c&next=${encodeURIComponent(next)}`),
    );
    expect(r.headers.get('location')).toBe('http://localhost/');
  }
});
