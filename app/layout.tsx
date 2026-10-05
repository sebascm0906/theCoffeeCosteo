import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'The Coffee · Costeos', description: 'Recetas y costos por canal' };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <html lang="es"><body>{children}</body></html>;
}
