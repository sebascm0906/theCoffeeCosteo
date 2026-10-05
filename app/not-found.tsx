import Link from 'next/link';
export default function NotFound() {
  return (
    <main className="p-8">
      <h1>No encontramos este registro</h1>
      <Link href="/resumen">Volver al resumen</Link>
    </main>
  );
}
