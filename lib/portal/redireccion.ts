export function rutaInterna(ruta: string | null) {
  return ruta && /^\/(?!\/)/.test(ruta) && !/[\\\u0000-\u0020]/.test(ruta) ? ruta : '/';
}
