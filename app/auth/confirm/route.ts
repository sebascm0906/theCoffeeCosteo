import { NextResponse, type NextRequest } from 'next/server';
import { servidor } from '@/lib/supabase/servidor';
import { rutaInterna } from '@/lib/portal/redireccion';
export async function GET(request: NextRequest) {
  const db = await servidor();
  const p = request.nextUrl.searchParams;
  const hash = p.get('token_hash'),
    type = p.get('type'),
    code = p.get('code');
  if (hash && (type === 'invite' || type === 'recovery')) {
    const r = await db.auth.verifyOtp({ token_hash: hash, type });
    if (!r.error) return NextResponse.redirect(new URL('/establecer-contrasena', request.url));
  } else if (code) {
    const r = await db.auth.exchangeCodeForSession(code);
    if (!r.error) return NextResponse.redirect(new URL(rutaInterna(p.get('next')), request.url));
  }
  return NextResponse.redirect(new URL('/login?aviso=enlace', request.url));
}
