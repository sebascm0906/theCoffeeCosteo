'use client';
import { useActionState } from 'react';
import { entrar, establecer } from '@/app/(auth)/login/actions';
import { Button } from '@/components/ui/button';
export function FormularioAcceso({ nueva = false }: { nueva?: boolean }) {
  const [error, action, pending] = useActionState(nueva ? establecer : entrar, '');
  return <form action={action} className="space-y-5">
    {!nueva && <label>Correo<input name="email" type="email" autoComplete="username" required /></label>}
    <label>{nueva ? 'Nueva contraseña' : 'Contraseña'}<input name="password" type="password" autoComplete={nueva ? 'new-password' : 'current-password'} minLength={nueva ? 8 : undefined} required /></label>
    {nueva && <label>Confirmar contraseña<input name="confirmacion" type="password" autoComplete="new-password" required /></label>}
    {error && <p className="error" role="alert">{error}</p>}
    <Button className="w-full" disabled={pending}>{pending ? 'Un momento…' : nueva ? 'Guardar contraseña' : 'Entrar'}</Button>
  </form>;
}
