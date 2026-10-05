export function mensajeError(error: { code?: string; message: string }) {
  if (error.code === '40001')
    return 'La receta cambió. Tu borrador sigue aquí; abre la versión actual en otra pestaña y compara antes de recargar.';
  if (error.code === '42501') return 'No tienes permiso para guardar este cambio.';
  if (error.code === '23505') return 'Ya existe un registro con ese nombre o combinación.';
  if (error.code?.startsWith('23') || error.code === 'P0001') return error.message;
  return 'No se pudo completar la operación. Revisa la conexión e intenta de nuevo.';
}
