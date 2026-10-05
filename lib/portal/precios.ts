export function validarPrecio(valor: number | null) {
  if (valor !== null && (!Number.isFinite(valor) || valor <= 0))
    throw new Error('El precio debe ser positivo o quedar vacío.');
}
