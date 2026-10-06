# MCP de consultas para Claude en la web

## Objetivo

Conectar Claude en la web al portal de The Coffee mediante un servidor MCP remoto por HTTPS, alojado junto al portal en Vercel. Consultar datos reales y cálculos oficiales de Supabase, sin herramientas de escritura ni ejecución de SQL arbitrario.

## Arquitectura propuesta

- Transporte Streamable HTTP en `/mcp`, sin depender de memoria entre instancias de Vercel.
- Supabase Auth como servidor OAuth 2.1: cuentas existentes, PKCE y consentimiento explícito en el portal.
- Cliente de Supabase por petición con token verificado del usuario y perfil activo. Sin DATABASE_URL ni claves administrativas en el MCP.
- Consultas tipadas con límites y paginación; costos y márgenes proceden de las vistas SQL actuales.
- Protección en Postgres para que los tokens OAuth de esta integración no autoricen escrituras, incluso al usarlos directamente contra la API de Supabase. Revisar el claim `client_id` y todas las políticas y RPC existentes.
- Credenciales y tokens nunca se muestran en herramientas, respuestas o registros.

## Datos necesarios y acciones externas

- URL pública confirmada: `https://the-coffee-costeo.vercel.app`; MCP en `/mcp` y consentimiento en `/oauth/consent`.
- El usuario habilita OAuth Server y el registro dinámico de clientes en Supabase, configura Site URL y la ruta de consentimiento.
- El usuario publica cualquier migración nueva con `npx.cmd supabase db push`.
- Mantener deshabilitado el registro libre de usuarios. Registrar un cliente OAuth no crea una cuenta de usuario.
- El usuario añade el conector en Claude y autoriza con su cuenta del portal.
- No usar ni solicitar credenciales de Supabase; no modificar `.env.local`.

## Tareas

### 1. Transporte y autenticación

- Archivos: `app/mcp/route.ts`, `lib/mcp/autenticacion.ts`, ruta de metadatos OAuth, `package.json`, `package-lock.json`.
- Elegir SDK oficial y adaptador compatible con Next.js/Vercel según versiones vigentes.
- Validar token, emisor, cliente OAuth y perfil activo por petición; devolver desafíos 401 adecuados y respuestas sin caché.
- Pruebas: sin token, inválido, vencido, perfil ausente/inactivo, descubrimiento y negociación MCP; aislamiento entre usuarios.
- Terminado: peticiones anónimas no obtienen datos y el transporte funciona sin sesiones en memoria.

### 2. Consentimiento y protección de solo lectura

- Archivos: `app/oauth/consent/page.tsx`, acciones de consentimiento, migración SQL nueva, pruebas de base de datos.
- Mostrar aplicación solicitante, permiso de consulta y opciones aceptar/rechazar. Conservar el identificador de autorización al iniciar sesión y validar redirecciones.
- Restringir escrituras con tokens OAuth sin cambiar los permisos del portal para sesiones habituales.
- Pruebas: consentimiento, rechazo, cuenta inactiva, escritura directa por API/RPC bloqueada y escritura habitual por rol preservada.
- Terminado: Claude actúa como el usuario conectado y solo puede leer.

### 3. Herramientas de consulta

- Archivos: `lib/mcp/herramientas.ts`, módulos de consultas, pruebas de herramientas.
- Herramientas iniciales: buscar productos, consultar receta y costos por tamaño/canal, buscar insumos, consultar sub-recetas, localizar recetas que usan un insumo y consultar alertas de margen.
- Entradas validadas, campos explícitos, límites de resultados, paginación y errores comprensibles. Excluir perfiles y bitácora general del catálogo inicial.
- Pruebas: filtros, cantidades cero, precios ausentes/manuales, sub-recetas, límites, identificadores inválidos y permisos.
- Terminado: las respuestas coinciden con las vistas SQL del portal y no hay herramienta de SQL libre.

### 4. Verificación y guía de conexión

- Archivos: `README.md`, `docs/mcp/claude-web.md`, pruebas de integración.
- Ejecutar suite completa, tipos, compilación y revisión de formato.
- Documentar configuración de Supabase, URL `/mcp`, alta del conector en Claude y revocación.
- Verificación real con el usuario: conectar, autorizar, consultar costos de un producto conocido, comprobar perfil inactivo y revocación.
- Terminado: validaciones locales aprobadas y conexión real con Claude verificada; si requiere acciones del usuario, distinguirlas de lo ya probado.

## Estado de implementación local

Implementado: transporte remoto, metadatos, autenticación por token, consentimiento con retorno al login, seis herramientas y migración 9 de solo lectura. Validación: 166 pruebas en 29 archivos, tipos, compilación de Next.js y formato aprobados. El SDK MCP se prueba por HTTP con mensajes de inicialización y llamadas a herramientas; RLS y RPC se prueban en Postgres/PGlite.

Pendiente de acciones del usuario: publicar la migración, configurar OAuth Server y registro dinámico en Supabase, conectar Claude y verificar el flujo real. Instrucciones en `docs/mcp/claude-web.md`. No se ha ejecutado `db push` ni accedido a una sesión real de Claude.

## Referencias oficiales

- Claude: https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- Supabase Auth para MCP: https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication
- Supabase OAuth: https://supabase.com/docs/guides/auth/oauth-server/getting-started
- Vercel MCP: https://vercel.com/docs/mcp/deploy-mcp-servers-to-vercel
