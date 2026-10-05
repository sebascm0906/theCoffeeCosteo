export function rutaInterna(ruta: string | null) { return ruta && /^\/(?!\/)/.test(ruta) && !/[\\\r\n]/.test(ruta) ? ruta : '/'; }
