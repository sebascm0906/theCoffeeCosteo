import { ListaRecetas } from '@/components/recetas/lista';
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  return <ListaRecetas tipo="subreceta" q={(await searchParams).q} />;
}
