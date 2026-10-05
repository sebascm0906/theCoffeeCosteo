# Portal de Costeos The Coffee

Base de datos (Supabase/Postgres) con el costeo de productos: insumos, recetas, sub-recetas, márgenes por canal y bitácora.

## Requisitos
- Node 24+
- No hace falta Docker: las pruebas usan PGlite (Postgres en proceso).

## Estructura
- `supabase/migrations`: 7 migraciones (configuración y catálogos, recetas, vistas de costo, vistas de resumen y alertas, perfiles y bitácora, permisos RLS, precio manual por canal).
- `scripts/migracion`: migración del Excel (lectura, limpieza, plan de carga, conciliación y reporte).
- `scripts/db`: utilidades para la base local con PGlite.
- `tests`: pruebas de SQL, migración y paridad con el Excel.

## Roles
- `compras`: edita insumos y proveedores.
- `operaciones`: edita recetas, sub-recetas y tamaños.
- `finanzas`: edita precios de lista, precios manuales por canal, parámetros y canales.
- `admin`: todo lo anterior y además administra usuarios.

## Pruebas
```bash
npm test
```
La prueba de paridad necesita el Excel en `datos/Modelo_Costeo_Corregido_2026.xlsx` (no se versiona).

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
