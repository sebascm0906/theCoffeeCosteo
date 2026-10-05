import { FormularioAcceso } from '@/components/portal/formulario-acceso';
export default async function Login({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { aviso } = await searchParams;
  const configurado = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  return <main className="min-h-screen grid place-items-center p-6"><div className="w-full max-w-sm space-y-6">
    <div><p className="text-xs tracking-[.25em] uppercase text-primary">The Coffee</p><h1>Portal de costeos</h1><p className="text-muted-foreground mt-2">Recetas, costos y decisiones de precio.</p></div>
    <div className="panel space-y-5"><h2>Iniciar sesión</h2>
    {aviso && <p className="aviso">{aviso === 'perfil' ? 'Tu cuenta necesita un perfil activo. Contacta al administrador.' : 'El enlace no es válido o venció. Solicita una nueva invitación.'}</p>}
    {configurado ? <FormularioAcceso /> : <p className="aviso">Falta configurar Supabase. Consulta las instrucciones del README.</p>}
    <p className="text-xs text-muted-foreground">Acceso exclusivo para usuarios creados por el administrador.</p></div>
  </div></main>;
}
