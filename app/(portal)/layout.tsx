import Link from 'next/link';
import { sesion } from '@/lib/supabase/sesion';
import { salir } from '@/app/(auth)/login/actions';
import { Navegacion } from '@/components/portal/navegacion';
import { Marca } from '@/components/portal/marca';
import { LogOut } from 'lucide-react';
import { ChatPortal } from '@/components/portal/chat';
export const dynamic = 'force-dynamic';
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { perfil } = await sesion();
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="bg-primary text-white p-5 lg:sticky lg:top-0 lg:h-screen flex flex-col gap-7">
        <Link
          href="/"
          aria-label="The Coffee · Tablero"
          className="flex items-center gap-4 lg:flex-col lg:items-start"
        >
          <Marca />
          <span className="text-xs uppercase tracking-[.22em] text-neutral-400">Portal de costeos</span>
        </Link>
        <Navegacion />
        <div className="hidden lg:block flex-1" />
        <div className="border-t border-neutral-800 pt-5 flex items-center justify-between gap-3 lg:block text-sm">
          <div>
            <p className="font-medium">{perfil.nombre}</p>
            <p className="capitalize text-neutral-400 mt-1">{perfil.rol}</p>
          </div>
          <form action={salir}>
            <button className="inline-flex items-center gap-2 text-neutral-300 hover:text-white lg:mt-5">
              <LogOut size={16} aria-hidden="true" />
              Cerrar sesión
            </button>
          </form>
        </div>
      </aside>
      <main className="p-5 md:p-10 min-w-0 max-w-[1400px] w-full mx-auto space-y-6">{children}</main>
      <ChatPortal key={perfil.user_id} />
    </div>
  );
}
