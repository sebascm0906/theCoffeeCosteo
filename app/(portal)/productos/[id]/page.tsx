import { Ficha } from '@/components/recetas/ficha';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <Ficha tipo="producto" id={(await params).id} />;
}
