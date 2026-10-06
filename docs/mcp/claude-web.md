# Consultar The Coffee desde Claude en la web

Servidor: `https://the-coffee-costeo.vercel.app/mcp`.

Las consultas usan la cuenta y el perfil activo del portal. El MCP ofrece seis herramientas: buscar recetas, consultar receta, consultar costos, buscar insumos, recetas por insumo (también usos indirectos) y consultar alertas. Costos en MXN; porcentajes como fracciones; precios ausentes se conservan como null.

## Activación por el administrador

1. Publicar la migración 9 desde la carpeta del repositorio:

   ```powershell
   $env:Path = "C:\Program Files\nodejs;$env:Path"
   npx.cmd supabase db push
   ```

   Agrega políticas restrictivas para impedir insert/update/delete con tokens OAuth, restringe la consulta de perfiles al propio y oculta la bitácora. Las sesiones habituales del portal conservan los permisos por rol. El servidor y la pantalla de consentimiento permanecen bloqueados mientras falte esta migración.

2. En Supabase → Authentication → URL Configuration, configurar Site URL como `https://the-coffee-costeo.vercel.app`.
3. En Authentication → OAuth Server, habilitar el servidor OAuth 2.1 y configurar Authorization Path como `/oauth/consent`.
4. Habilitar Dynamic Client Registration. Solo registra aplicaciones OAuth; mantener desactivado el registro libre de usuarios.
5. Preferir firma JWT asimétrica en la configuración de Supabase (necesaria si se solicita `openid`). No cambiar claves ni copiar secretos al repositorio. No se necesita una clave administrativa para el MCP.
6. Verificar que la versión del portal que incluye `/mcp` está desplegada y que las dos variables públicas habituales de Supabase siguen configuradas en Vercel.

## Conectar en Claude

1. Customize/Personalizar → Connectors/Conectores → Add custom connector.
2. Nombre: `The Coffee`. URL: `https://the-coffee-costeo.vercel.app/mcp`.
3. Autenticación mediante inicio de sesión. Para el cliente OAuth elegir **Register automatically / Registrarse automáticamente**, porque esta integración utiliza el registro dinámico de Supabase. No introducir claves administrativas ni contraseñas como headers.
4. Iniciar sesión con la cuenta habitual del portal y aprobar **Permitir consultas**. La pantalla muestra la aplicación y los permisos solicitados.
5. Activar el conector en una conversación.

Ejemplos: “Busca Americano y compara su costo y margen por tamaño y canal”, “¿Qué productos usan leche, incluyendo las sub-recetas?”, “Muéstrame las alertas de Rappi”. Si hay más de una página, pedir que consulte las páginas restantes.

## Verificación real pendiente

- Sin iniciar sesión, `/mcp` debe responder 401 con `WWW-Authenticate` y la URL de descubrimiento.
- `/.well-known/oauth-protected-resource` debe identificar el endpoint `/mcp` y el emisor Supabase de este proyecto.
- Al conectar, deben aparecer seis herramientas, todas de consulta.
- Comparar el costo de un producto conocido contra el portal y comprobar precios manuales y ausentes.
- Un perfil inactivo no debe consultar. Rechazar el consentimiento no debe conectar.
- No hay SQL libre ni herramientas de escritura.

## Revocación y límites

Desconectar el conector en Claude y revocar la autorización desde Supabase. La revocación de una autorización evita nuevas renovaciones; un JWT ya emitido puede seguir vigente hasta su expiración. Desactivar el perfil bloquea las consultas por la comprobación en cada petición y las políticas SQL.

Los tokens incluyen `client_id`; la audiencia estándar de Supabase es `authenticated`. El servidor verifica firma, emisor, audiencia, caducidad, identidad y perfil activo. Las políticas SQL restringen todos los clientes OAuth de este proyecto a lectura, no solo Claude. Otras integraciones OAuth futuras necesitarán revisar expresamente ese alcance.

No se han usado credenciales del administrador ni comprobado un login real de Claude desde el entorno local. Los costes y márgenes proceden de las vistas SQL. Cada herramienta devuelve como máximo 50 resultados por página; detalles de recetas y búsquedas de dependencias tienen límites explícitos y fallan si la consulta los supera.

## Referencias

- [Claude: conectores personalizados](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).
- [Supabase: OAuth para MCP](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication).
- [Supabase: tokens y RLS](https://supabase.com/docs/guides/auth/oauth-server/token-security).
- [Vercel: desplegar un MCP con Next.js](https://vercel.com/docs/mcp/deploy-mcp-servers-to-vercel).
