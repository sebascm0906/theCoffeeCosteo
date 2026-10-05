import Link from 'next/link';
import { sesion } from '@/lib/supabase/sesion';
import { salir } from '@/app/(auth)/login/actions';
export const dynamic = 'force-dynamic';
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { perfil } = await sesion();
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[230px_1fr]">
      <aside className="bg-[#213c30] text-white p-6 lg:min-h-screen">
        <p className="tracking-[.25em] text-xs uppercase">The Coffee</p>
        <p className="text-xl mt-2 mb-8">Costeos</p>
        <nav aria-label="Principal" className="flex flex-wrap lg:flex-col gap-4">
          {[
            ['/', 'Tablero'],
            ['/resumen', 'Resumen'],
            ['/productos', 'Productos'],
            ['/subrecetas', 'Sub-recetas'],
            ['/insumos', 'Insumos'],
            ['/configuracion', 'Configuración'],
          ].map(([href, label]) => (
            <Link key={href} className="hover:underline" href={href}>
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-12 text-sm text-[#c2d6c7]">
          <p>{perfil.nombre}</p>
          <p className="capitalize">{perfil.rol}</p>
          <form action={salir}>
            <button className="mt-4 underline">Cerrar sesión</button>
          </form>
        </div>
      </aside>
      <main className="p-5 md:p-10 min-w-0 max-w-[1500px] w-full mx-auto space-y-6">{children}</main>
    </div>
  );
}
