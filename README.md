# Portal de Costeos The Coffee

Portal Next.js con acceso por invitación y base Supabase/Postgres: insumos, recetas, sub-recetas, márgenes por canal y bitácora. Los cálculos oficiales y los permisos viven en Postgres.

## Requisitos
- Node 24+
- No hace falta Docker: las pruebas usan PGlite (Postgres en proceso).

## Estructura
- `app`, `components`, `lib`: pantallas, formularios y clientes Supabase con sesión del usuario.
- `supabase/migrations`: 9 migraciones; la octava agrega guardado atómico de recetas y la novena restringe los tokens OAuth a consultas.
- `scripts/migracion`: migración del Excel (lectura, limpieza, plan de carga, conciliación y reporte).
- `scripts/db`: utilidades para la base local con PGlite.
- `tests`: pruebas de SQL, migración, paridad con el Excel, sesión, servicios y componentes del portal.
- `docs/portal/verificacion-plan-2.md`: resultados locales y guion pendiente para Supabase real.

## Roles
- `compras`: edita insumos, proveedores y categorías de insumo.
- `operaciones`: edita recetas, sub-recetas, categorías de producto y los tamaños que vende cada producto (sin capturar precios).
- `finanzas`: edita precios de lista, precios manuales por canal, parámetros, canales y el catálogo de tamaños.
- `admin`: todas las áreas y perfiles. En Plan 2, las cuentas se crean/invitan desde Supabase, no desde el portal.

Todos los roles con perfil activo pueden consultar. Sin perfil o con perfil inactivo, una cuenta de Auth no accede a datos.

## Iniciar el portal

```bash
npm ci
npm run dev
```

Abrir `http://localhost:3000/login`. Sin configuración, aparece un aviso para configurar Supabase.
El usuario agrega a su `.env.local` las variables `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` indicadas en `.env.example`. No pegar claves administrativas ni DATABASE_URL en variables NEXT_PUBLIC. El portal no necesita conexión SQL privilegiada.

En Supabase, el usuario configura la URL local del sitio y las URLs permitidas de retorno. Para enlaces de invitación y recuperación, la plantilla de correo debe dirigir a:

```text
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite
{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery
```

Se confirma el enlace y se establece contraseña; después se usa correo/contraseña para entrar. El flujo PKCE también acepta `/auth/confirm?code=...&next=/establecer-contrasena`. No hay registro libre. El administrador crea el perfil antes de que el invitado consulte datos.

Para producción local: `npm run build` y `npm start`. El portal está conectado a Vercel mediante la rama `main`.

## Claude en la web (MCP)

Endpoint remoto: `https://the-coffee-costeo.vercel.app/mcp`. Solo consultas de recetas, ingredientes, costos y alertas, con Supabase OAuth y perfil activo. Primero publicar la migración 9 y configurar OAuth Server en Supabase. Guía de activación y conexión: [docs/mcp/claude-web.md](docs/mcp/claude-web.md). No usa claves administrativas ni la conexión DATABASE_URL del importador.

## Primer administrador y otras cuentas (acciones del usuario)

Crear/invitar la cuenta en Supabase → Authentication → Users. Después ejecutar en su SQL Editor, sustituyendo el correo por el de la cuenta ya creada:

```sql
insert into public.perfiles (user_id, nombre, rol)
select id, 'Administrador', 'admin'
from auth.users where email = '<correo del administrador>';
```

Para otras cuentas, el administrador usa el mismo patrón con nombre y rol `compras`, `operaciones` o `finanzas`. Para desactivar acceso, cambia `perfiles.activo` a `false` desde Supabase. No es necesario borrar la cuenta ni los datos de negocio. No compartir contraseñas ni claves con el agente.

## Pruebas
```bash
npm test
npm run typecheck
npm run build
npm run format:check
```
La prueba de paridad necesita el Excel en `datos/Modelo_Costeo_Corregido_2026.xlsx` (no se versiona).

`npm run prueba:visual` abre un arnés de componentes separado en `http://127.0.0.1:4173`, con datos sintéticos, sin Auth ni escrituras. No es el portal ni verifica Supabase real. Las capturas están en `docs/portal/`.

## Migración del Excel
```bash
npm run migracion            # ensayo local + reporte en datos/reporte-migracion.xlsx
npm run migracion -- --aplicar   # carga en Supabase (requiere DATABASE_URL en .env.local)
```
Solo se aplica si la conciliación cuadra al centavo y la base de Supabase está vacía.

El reporte (`datos/reporte-migracion.xlsx`) lista las equivalencias de categorías, las sub-recetas propuestas, los mixes sin agrupar, los avisos y la conciliación de costos. Entre los avisos aparece "Precio Rappi manual": precios de Rappi capturados a mano en el Excel, que se conservan como precio manual por canal.

## Publicar el esquema
Antes de publicar: en Supabase → Authentication → Providers/Sign In, desactivar "Allow new users to sign up" (el portal es solo por invitación).

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push
```
