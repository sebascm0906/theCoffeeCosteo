# Verificación del Plan 2

Fecha: 2026-10-05. Rama: `plan-2-portal`. Implementación local; sin publicación ni acceso a Supabase Cloud.

## Resultado de la corrida final

- npm test: 24 archivos, 142 pruebas aprobadas.
- npm run typecheck: aprobado.
- npm run build: aprobado; todas las rutas generadas.
- npm run format:check: aprobado.
- main permanece en 57c68d3; cambios solo en plan-2-portal.

## Cobertura local

- Vitest + PGlite aplica las ocho migraciones desde cero. Mantiene la paridad del Excel y prueba guardado de recetas, permisos, rollback de datos/bitácora, ciclos, inactivos, conservación de precios, identidad de líneas, retirada de tamaños y conflictos de versión tras escritura directa.
- Testing Library verifica selección por teclado, formularios por rol, porcentajes, resumen sin precio/costo cero, paginación y conservación de captura ante conflicto o refresco remoto.
- Dobles del SDK verifican sesión, perfil activo, expiración durante una acción, rechazo de tablas ajenas/campos técnicos y ausencia de falsos éxitos al no obtener filas. No reemplazan pruebas de Auth/PostgREST reales.
- El callback de invitación acepta invite/recovery y PKCE, rechaza enlaces vencidos y redirecciones externas.
- Navegador: login con variables sintéticas hacia localhost, sin conexión a un proyecto real. Capturas `login-desktop.png` y `login-movil.png`; sin errores JS. Ancho móvil: 390 px.
- Navegador: resumen/editor en arnés Vite de pruebas separado, sin rutas de negocio ni acceso a base. Búsqueda de chocolate, selección con teclado, cambio de unidad gr → ml. Capturas `editor-prueba.png` y `editor-movil-prueba.png`. Ancho y contenido de página móvil: 390 px; las tablas anchas tienen desplazamiento interno.

## Decisiones de implementación

- Next.js 16 usa `proxy.ts`; identidad comprobada en servidor y perfil activo en cada operación. La renovación usa cookies y las respuestas privadas no se cachean entre usuarios.
- Escrituras normales con sesión y RLS; ninguna clave administrativa ni conexión DATABASE_URL en el portal.
- `guardar_receta` usa SECURITY INVOKER y permisos explícitos de ejecución; rechaza precios en su contrato. Versiones pueden aumentar varias veces por guardado porque cada modificación de un componente también invalida borradores previos.
- Un bloqueo común antes de las sentencias de edición serializa cambios de recetas. Evita invertir el orden entre cabeceras y el trigger de ciclos existente; prioriza consistencia sobre concurrencia para el volumen actual.
- Solo los triggers de auditoría/versionado usan SECURITY DEFINER con search_path fijo y ejecución pública revocada; no reciben datos del cliente ni cambian permisos de negocio.
- El historial contextual usa páginas de 50 cambios por cursor; las consultas de catálogos/vistas usan páginas estables de 500 para superar el límite del API.
- El resumen conserva filtros en la URL. Insumos pagina de 25 en 25. Catálogos/recetas son pequeños y muestran todos los registros buscados.
- La UI muestra precio calculado/manual, comisión App propia pendiente, costo oficial y estimación de edición separados. Finanzas guarda precios de manera independiente del editor de receta.
- No se cambiaron las migraciones 0001–0007, el importador ni el reporte que está revisando el usuario.

## Configuración y comandos que ejecuta el usuario

1. Completar revisión del reporte y publicación/carga del Plan 1 según README. Mantener registro libre desactivado en Cloud; el config local ya lo desactiva.
2. Publicar también la migración 0008: el usuario ejecuta `npx supabase db push` después de su login/link. El agente no ejecutó ninguno de esos comandos.
3. Agregar las dos variables públicas del portal en su entorno, crear su cuenta y perfil admin con el SQL del README, configurar URL del sitio, redirects y plantillas de invitación.
4. Ejecutar `npm run dev` y abrir el login. No compartir claves ni contraseñas.

## Guion pendiente contra servicio real

- [ ] Admin entra mediante cuenta creada, invitación/contraseña y perfil activo. Enlace vencido falla con aviso; no hay signup.
- [ ] Usuario sin perfil o desactivado no obtiene tablas ni vistas desde portal ni API.
- [ ] Compras edita costo de insumo; Operaciones edita receta; Finanzas edita precio y configuración. Los otros roles no escriben ni manipulando solicitudes directamente.
- [ ] Operaciones guarda producto y sub-receta con dropdowns; la vista SQL refleja el costo. Una cantidad inválida o ciclo revierte todo.
- [ ] Finanzas crea y retira manual Rappi; vuelve a la fórmula y conserva precio de lista. El cambio queda auditado.
- [ ] Dos sesiones cargan la misma receta. Una guarda; la otra recibe conflicto y conserva captura. Confirmar este caso también cambiando cantidades directamente por API.
- [ ] Expirar sesión durante captura: el guardado falla sin navegar fuera; reautenticar en otra pestaña y volver a intentar.
- [ ] Cambiar parámetros refresca el resumen; confirmar comisión App propia elimina el aviso explícitamente.
- [ ] Verificar PostgREST y el contrato tipado contra el proyecto publicado; regenerar tipos si el usuario descubre diferencias con su esquema.

PGlite no demuestra concurrencia de conexiones reales, comportamiento de Supabase Auth, cookies/SMTP, ni PostgREST Cloud. Estas comprobaciones requieren el servicio real y quedan pendientes del usuario. Carga masiva, exportación, bitácora general, Vercel y e2e completos permanecen en Plan 3.

## Referencias técnicas consultadas

- [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Next.js Proxy](https://nextjs.org/docs/app/api-reference/file-conventions/proxy)
- Documentación incluida en `node_modules/next/dist/docs/` de la versión instalada: Proxy, Server Actions y cookies.
