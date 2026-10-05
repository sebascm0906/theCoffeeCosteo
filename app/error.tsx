'use client';
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="p-8"><h1>No pudimos abrir esta pantalla</h1><p>Revisa la conexión y la configuración de Supabase.</p><button onClick={reset} className="mt-4 underline">Intentar de nuevo</button></main>; }
