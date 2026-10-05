import { sesion } from '@/lib/supabase/sesion';
import { todas } from '@/lib/portal/consultas';
import { TablaResumen } from '@/components/portal/tabla-resumen';
import { AvisoComision } from '@/components/portal/aviso-comision';
export default async function ResumenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { db } = await sesion();
  const [filas, alertas, canales] = await Promise.all([
    todas(db, 'v_resumen', 'producto_id,tamano_id,canal_id'),
    todas(db, 'v_alerta_producto_canal', 'producto_id,canal_id'),
    todas(db, 'canales', 'orden,id'),
  ]);
  return (
    <>
      <header>
        <p className="text-sm text-muted-foreground">Consulta</p>
        <h1>Resumen de costeo</h1>
      </header>
      <AvisoComision pendiente={canales.some((c) => !c.comision_confirmada)} />
      <TablaResumen filas={filas} alertas={alertas} filtros={await searchParams} />
    </>
  );
}
