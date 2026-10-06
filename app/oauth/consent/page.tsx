import { redirect } from 'next/navigation';
import { servidor } from '@/lib/supabase/servidor';
import { sesion } from '@/lib/supabase/sesion';
import { Marca } from '@/components/portal/marca';
import { Button } from '@/components/ui/button';
import { idAutorizacion, retornoClaude } from '@/lib/mcp/consentimiento';
import { decidir } from './actions';
export const dynamic = 'force-dynamic';
export default async function Consentimiento({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  const parametros = await searchParams;
  let id: string;
  try {
    id = idAutorizacion(parametros.authorization_id);
  } catch {
    return (
      <main className="p-6">
        <p className="error">Enlace inválido. Vuelve a conectar Claude.</p>
      </main>
    );
  }
  const db = await servidor();
  const usuario = await db.auth.getUser();
  if (usuario.error || !usuario.data.user)
    redirect(`/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${id}`)}`);
  const { perfil } = await sesion();
  const proteccion = await db.rpc('mcp_lectura_habilitada');
  if (proteccion.error || proteccion.data !== true)
    return (
      <main className="p-6">
        <p className="aviso">
          El administrador debe publicar la migración de consultas MCP antes de conectar Claude.
        </p>
      </main>
    );
  const detalles = await db.auth.oauth.getAuthorizationDetails(id);
  if (detalles.error || !detalles.data)
    return (
      <main className="p-6">
        <p className="error">
          El enlace venció o Supabase OAuth todavía no está configurado. Vuelve a conectar Claude.
        </p>
      </main>
    );
  if ('redirect_url' in detalles.data) redirect(retornoClaude(detalles.data.redirect_url));
  try {
    retornoClaude(detalles.data.redirect_uri);
  } catch {
    return (
      <main className="p-6">
        <p className="error">Esta solicitud no usa el retorno permitido de Claude.</p>
      </main>
    );
  }
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <div className="w-full max-w-lg space-y-6">
        <Marca />
        <div className="panel space-y-5">
          <h1>Conectar con Claude</h1>
          <p>
            <strong>{detalles.data.client.name || 'Cliente OAuth'}</strong> solicita acceso con tu cuenta de
            The Coffee.
          </p>
          <p className="text-sm text-muted-foreground">
            Conectado como {perfil.nombre}. Los datos consultados se compartirán con Claude para responder tus
            preguntas.
          </p>
          <ul className="list-disc pl-5 space-y-2 text-sm">
            <li>Consultar productos, recetas, sub-recetas e ingredientes.</li>
            <li>Consultar costos, precios por canal y alertas de margen.</li>
            <li>Sin permiso para crear, editar o borrar datos.</li>
          </ul>
          <p className="text-sm text-muted-foreground">
            Permisos de identidad solicitados: {detalles.data.scope || 'Ninguno adicional'}.
          </p>
          <form action={decidir} className="flex flex-wrap gap-3">
            <input type="hidden" name="authorization_id" value={id} />
            <Button name="decision" value="aceptar">
              Permitir consultas
            </Button>
            <Button variant="outline" name="decision" value="rechazar">
              Rechazar
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">
            Puedes revocar el acceso desde Conectores en Claude o las autorizaciones OAuth de Supabase.
          </p>
        </div>
      </div>
    </main>
  );
}
