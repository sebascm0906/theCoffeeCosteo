'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, ListFilter, Coffee, Layers, Package, Settings } from 'lucide-react';
const enlaces = [
  { href: '/', nombre: 'Tablero', icono: LayoutDashboard },
  { href: '/resumen', nombre: 'Resumen', icono: ListFilter },
  { href: '/productos', nombre: 'Productos', icono: Coffee },
  { href: '/subrecetas', nombre: 'Sub-recetas', icono: Layers },
  { href: '/insumos', nombre: 'Insumos', icono: Package },
  { href: '/configuracion', nombre: 'Configuración', icono: Settings },
];
export function Navegacion() {
  const pathname = usePathname();
  return (
    <nav aria-label="Principal" className="flex gap-2 overflow-x-auto py-1 lg:flex-col lg:overflow-visible">
      {enlaces.map(({ href, nombre, icono: Icono }) => {
        const activo =
          href === '/' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={activo ? 'page' : undefined}
            className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors ${activo ? 'bg-white text-black' : 'text-neutral-300 hover:bg-neutral-900 hover:text-white'}`}
          >
            <Icono size={18} aria-hidden="true" />
            {nombre}
          </Link>
        );
      })}
    </nav>
  );
}
