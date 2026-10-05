'use server';
import { servidor } from '@/lib/supabase/servidor';
import { redirect } from 'next/navigation';
export async function entrar(_: string, form: FormData) {
  const db = await servidor();
  const email = String(form.get('email') ?? '').trim(),
    password = String(form.get('password') ?? '');
  if (!email || !password) return 'Escribe tu correo y contraseña.';
  const r = await db.auth.signInWithPassword({ email, password });
  if (r.error) return 'No pudimos iniciar sesión. Revisa tu correo y contraseña.';
  redirect('/');
}
export async function salir() {
  const db = await servidor();
  const r = await db.auth.signOut();
  if (r.error) throw new Error('No se pudo cerrar la sesión');
  redirect('/login');
}
export async function establecer(_: string, form: FormData) {
  const password = String(form.get('password') ?? '');
  if (password.length < 8) return 'Usa al menos 8 caracteres.';
  if (password !== form.get('confirmacion')) return 'Las contraseñas no coinciden.';
  const db = await servidor();
  const user = await db.auth.getUser();
  if (user.error || !user.data.user) return 'El enlace venció. Solicita otra invitación al administrador.';
  const r = await db.auth.updateUser({ password });
  if (r.error) return 'No se pudo establecer la contraseña. Revisa los requisitos de tu cuenta.';
  redirect('/');
}
