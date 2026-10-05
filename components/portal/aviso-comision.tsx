export function AvisoComision({ pendiente }: { pendiente: boolean }) {
  return pendiente ? (
    <p className="aviso">Comisión de App propia por confirmar. Sus márgenes son provisionales.</p>
  ) : null;
}
