# Plan 2 — Portal web, acceso y editor de recetas

**Fecha:** 2026-10-05  
**Estado:** Listo para revisión; decisiones de alcance confirmadas y aprobación del documento requerida antes de implementar.

**Goal:** Consultar y administrar los datos del Plan 1 desde un portal en español, con acceso restringido a usuarios creados por el administrador y edición de recetas mediante selectores de catálogos.

**Architecture:** Propuesta del diseño existente: Next.js App Router con TypeScript; Supabase Auth para sesiones y Postgres con RLS para datos. Las consultas y escrituras usan la sesión del usuario, nunca una conexión privilegiada ni DATABASE_URL. Postgres conserva todos los cálculos oficiales. El guardado de una receta completa se realiza mediante una RPC transaccional con control de versión. Vitest + PGlite mantienen la cobertura SQL; pruebas de componentes y servicios cubren el portal sin necesitar la cuenta del usuario.

**Tech Stack:** Propuesto: Next.js, React, TypeScript, Tailwind, shadcn/ui, TanStack Table, Supabase JS y SSR; Vitest, Testing Library y PGlite. Seleccionar versiones compatibles y revisar documentación oficial al implementar, sin actualizar innecesariamente las herramientas del Plan 1.

**Spec:** `docs/superpowers/specs/2026-10-05-portal-costeos-design.md`  
**Referencia de formato:** `docs/superpowers/plans/2026-10-05-plan-1-base-de-datos-y-migracion.md`

**Este es el plan 2 de 3.** La propuesta mantiene para Plan 3 carga masiva, exportación Excel, pantalla general de bitácora, despliegue Vercel y suite e2e completa. El historial contextual de una receta sí pertenece a su ficha en Plan 2.

## Estado verificado

- HEAD: `57c68d3`, rama `main`; árbol de trabajo limpio antes de redactar este documento.
- Solo existe la rama local `main`; no hay remotos configurados. Los commits del Plan 1 están en su historial. No se observó un commit de merge; la integración puede haber sido fast-forward.
- `npm test`: 14 archivos, **108 pruebas aprobadas**, incluida paridad con el Excel real.
- `npm run typecheck`: aprobado.
- Existen siete migraciones SQL; la séptima agrega precios manuales por canal, sus permisos y su bitácora.
- El CLI verifica la conciliación remota dentro de la transacción, antes del commit. No se ejecutó el CLI ni se regeneró el reporte que está revisando el usuario.
- No se verificó ni se accedió a Supabase Cloud; su publicación y la revisión del reporte permanecen a cargo del usuario.

## Decisiones confirmadas por el usuario

El usuario confirmó las siguientes decisiones en este chat. Falta su aprobación del documento completo antes de implementar:

| Decisión | Confirmación |
|---|---|
| Framework | Mantener Next.js + TypeScript + Tailwind + shadcn/ui del diseño |
| Roles | Conservar compras, operaciones, finanzas y admin, con los permisos SQL actuales |
| Usuarios | Crear/invitar cuentas desde Supabase por el usuario; portal sin registro, sin invitaciones administrativas en esta etapa |
| Pantallas y orden | Login → resumen y ficha → editor de productos/sub-recetas → insumos → configuración → tablero |
| Alcance posterior | Mantener carga masiva, exportación, bitácora general y despliegue en Plan 3 |

Si se solicita invitar desde el portal, reemplazar la propuesta de usuarios por una tarea específica de API administrativa solo en servidor, autorización admin, pruebas y configuración gestionada por el usuario. No asumir disponibilidad de una clave administrativa.

## Global Constraints

- Esperar aprobación explícita. Después crear la rama exacta `plan-2-portal` desde el estado aprobado; commits pequeños por tarea. No unir a main ni publicar sin petición.
- No pedir ni usar credenciales del usuario; no ejecutar `supabase login`, `link`, `db push` ni migración con `--aplicar`. No leer ni modificar `.env.local`. No versionar secretos ni archivos Excel.
- Solo documentar nombres de variables y ejemplos vacíos en `.env.example`. El usuario configura URL del proyecto y clave pública del portal en su entorno. No usar service role ni DATABASE_URL en el portal propuesto.
- Conservar migraciones 0001–0007; cualquier ampliación va en una migración nueva. No modificar equivalencias, sub-recetas migradas ni el reporte sin nueva instrucción.
- UI, errores, avisos y nombres de negocio en español. Escritorio como prioridad, consulta usable en celular, formularios accesibles por teclado.
- Todos los perfiles activos leen; compras/admin editan insumos, proveedores y categorías de insumo; operaciones/admin editan recetas y categorías de producto; finanzas/admin editan parámetros, canales, catálogo de tamaños y precios.
- Operaciones asigna tamaños a productos, con precios nuevos nulos. Solo Finanzas/Admin cambia precios de lista y manuales. Quitar un tamaño advierte que desaparecen cantidades y precios manuales asociados.
- RLS y triggers son la autoridad; ocultar botones no sustituye autorización. Verificar sesión y perfil activo en cada operación, sin cachear datos privados entre usuarios.
- Usar IDs de catálogos, nunca nombres escritos como relación. Unidades: `gr | ml | pza`; las cantidades usan la unidad del componente seleccionado, sin conversiones implícitas. La unidad del rendimiento se elige al editar sub-recetas.
- No borrar físicamente insumos, recetas, proveedores o categorías. Los inactivos existentes se muestran con aviso; no se ofrecen como nuevas selecciones.
- Costos/márgenes oficiales salen de vistas; conservar precio manual y aviso de comisión App propia por confirmar. El costo preliminar del editor se etiqueta como estimación y se reemplaza por el dato SQL al guardar.
- Mantener estilo TypeScript estricto, comillas simples y funciones de negocio pequeñas. No copiar del Plan 1 la atribución de commits a otra herramienta.

## Review Focus

1. Usuario sin sesión, sin perfil o con perfil inactivo no obtiene datos ni escribe.
2. Receta completa: error en una cantidad revierte cabecera, tamaños, líneas y bitácora; nunca queda parcialmente guardada.
3. Dos editores no sobrescriben silenciosamente: versión esperada, bloqueo y conflicto visible conservando borrador.
4. Guardar receta no toca precios existentes de Finanzas. Finanzas cambia precios sin obtener permiso de edición de receta.
5. Inactivos y ciclos no se ocultan ni se convierten en costo cero por ausencia de una opción.
6. Resumen no pierde productos sin precio o sin líneas, ni confunde alertas por producto/canal con alertas por tamaño.

## Estructura de archivos propuesta

```text
app/layout.tsx, app/globals.css
app/(auth)/login/page.tsx
app/auth/confirm/route.ts
app/(auth)/establecer-contrasena/page.tsx
app/(portal)/layout.tsx
app/(portal)/resumen/page.tsx
app/(portal)/productos/page.tsx
app/(portal)/productos/[id]/page.tsx
app/(portal)/productos/nuevo/page.tsx
app/(portal)/subrecetas/page.tsx
app/(portal)/subrecetas/[id]/page.tsx
app/(portal)/subrecetas/nueva/page.tsx
app/(portal)/insumos/page.tsx
app/(portal)/configuracion/page.tsx
app/(portal)/page.tsx
lib/supabase/{cliente,servidor,sesion,database.types}.ts
lib/portal/{permisos,errores,validacion,consultas,recetas,precios,insumos,configuracion,tablero}.ts
components/ui/                         componentes shadcn usados
components/portal/                     navegación, tablas y avisos
components/recetas/                    editor y selector de componentes
tests/portal/                          servicios, formularios y sesión
tests/db/guardar-receta.test.ts
supabase/migrations/20261005000008_guardar_receta.sql
```

La convención de renovación de sesión (middleware/proxy) y los archivos de configuración se ajustarán a la versión confirmada de Next.js al implementar.

---

### Task 1: Preparar rama, aplicación y pruebas del portal

**Files:**
- Modify: `package.json`, `package-lock.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `.env.example`
- Create: `next.config.ts`, `postcss.config.mjs`, `components.json`, `app/layout.tsx`, `app/globals.css`, `tests/portal/setup.ts`
- Test: `tests/portal/arnes.test.tsx`

**Interfaces:** Mantener `npm test`, `npm run typecheck` y `npm run migracion`; añadir `dev`, `build`, `start`. Configurar pruebas DOM de TSX separadas del entorno Node/PGlite.

- [ ] **Step 1:** Después de aprobación, verificar Git y crear `plan-2-portal`; fijar dependencias compatibles en lockfile.
- [ ] **Step 2:** Crear base visual y arnés DOM, sin instalar ni ejecutar servicios Supabase.
- [ ] **Step 3:** Probar render accesible y ejecutar suite original + typecheck + build con configuración ficticia de pruebas, sin conexión real.
- [ ] **Step 4:** Commit `chore(portal): aplicación y arnés de pruebas`.

**Terminado:** Aplicación compila y las 108 pruebas existentes siguen pasando; el importador conserva su funcionamiento.

### Task 2: Clientes Supabase, consultas tipadas y permisos

**Files:**
- Create: `lib/supabase/cliente.ts`, `lib/supabase/servidor.ts`, `lib/supabase/database.types.ts`, `lib/portal/permisos.ts`, `lib/portal/errores.ts`, `lib/portal/consultas.ts`
- Test: `tests/portal/permisos.test.ts`, `tests/portal/consultas.test.ts`

**Interfaces:** Cliente con sesión por petición; tipos fieles al SQL, incluidos numeric, campos nulos, vistas y precio manual. Matriz de permisos para UI; errores distinguen denegación, validación, inexistencia y conexión.

- [ ] **Step 1:** Escribir pruebas de matriz por rol, numeric/nulos y errores de lectura; no convertir un error de conexión en una lista vacía.
- [ ] **Step 2:** Implementar clientes y tipos a partir del esquema local; documentar posterior contraste con tipos generados por el usuario si hace falta.
- [ ] **Step 3:** Verificar aislamiento entre peticiones y ausencia de claves privilegiadas en el bundle.
- [ ] **Step 4:** Pruebas específicas + typecheck; commit `feat(portal): acceso tipado y permisos`.

**Terminado:** Consultas de negocio usan sesión del usuario y conservan precisión suficiente, nulos y avisos SQL.

### Task 3: Login, invitaciones existentes y sesión protegida

**Files:**
- Create: `lib/supabase/sesion.ts`, `app/(auth)/login/page.tsx`, `app/(auth)/login/actions.ts`, `app/auth/confirm/route.ts`, `app/(auth)/establecer-contrasena/page.tsx`, `app/(portal)/layout.tsx`, `components/portal/navegacion.tsx`, archivo de renovación de sesión según Next.js
- Modify: `supabase/config.toml`
- Test: `tests/portal/sesion.test.ts`, `tests/portal/login.test.tsx`

**Interfaces:** Correo/contraseña; cierre de sesión; callback de invitación y establecimiento de contraseña para cuentas previamente creadas. Sin signUp ni creación automática de perfiles. Confirmación restringida a redirecciones internas válidas.

- [ ] **Step 1:** Probar login correcto/incorrecto, sesión vencida, ausencia/inactividad de perfil, cierre de sesión y callback inválido.
- [ ] **Step 2:** Implementar comprobación de identidad con API verificada del SDK y perfil activo en lectura/escritura; renovación de cookies.
- [ ] **Step 3:** Desactivar registro en configuración local (actualmente está habilitado); documentar que el usuario debe desactivarlo también en Cloud.
- [ ] **Step 4:** Probar expiración durante captura: conserva borrador en memoria y pide reautenticación, sin guardar datos privados en almacenamiento persistente.
- [ ] **Step 5:** Pruebas específicas + typecheck; commit `feat(auth): acceso restringido y sesión`.

**Terminado:** Rutas y acciones protegidas; usuario creado en Auth necesita perfil activo; no existe registro libre. Las pruebas con dobles del SDK no se presentan como validación de Auth Cloud.

### Task 4: Resumen y fichas de consulta

**Files:**
- Create: `app/(portal)/resumen/page.tsx`, `app/(portal)/productos/page.tsx`, `app/(portal)/productos/[id]/page.tsx`, `components/portal/tabla-resumen.tsx`, `components/portal/aviso-comision.tsx`
- Modify: `lib/portal/consultas.ts`
- Test: `tests/portal/resumen.test.tsx`, `tests/portal/ficha.test.tsx`

**Interfaces:** Leer `v_resumen`, `v_alerta_producto_canal`, recetas y catálogos. Búsqueda y filtros por categoría, canal, tamaño, alerta y estado; paginación sin truncar silenciosamente los resultados del API. Ficha por ID con cantidades, costos, precios y márgenes por tamaño/canal.

- [ ] **Step 1:** Probar sin precio, costo 0, inactivos, múltiples tamaños/canales, precio calculado vs manual y comisión pendiente.
- [ ] **Step 2:** Implementar consultas/filtros paginados y estados de carga, vacío, error e ID inexistente.
- [ ] **Step 3:** Mostrar alerta al nivel producto/canal que produce SQL, sin recalcular reglas en JavaScript.
- [ ] **Step 4:** Pruebas específicas + typecheck; commit `feat(portal): resumen y fichas de producto`.

**Terminado:** Totales mostrados provienen de SQL; todos los registros son alcanzables y los filtros conservan su estado al abrir una ficha.

### Task 5: Contrato y guardado atómico de recetas

**Files:**
- Create: `supabase/migrations/20261005000008_guardar_receta.sql`, `lib/portal/validacion.ts`, `lib/portal/recetas.ts`, `tests/db/guardar-receta.test.ts`, `tests/portal/recetas.test.ts`
- Modify: `tests/db/recetas.test.ts` si se amplía cobertura de versión

**Interfaces:** RPC `guardar_receta`: ID opcional para alta, versión esperada para edición, cabecera, tamaños y líneas con IDs y cantidades. Devuelve ID y versión; fallos distinguibles de conflicto/validación/permiso. No recibe precios ni identidad/rol del cliente.

- [ ] **Step 1:** Probar primero alta y edición como operaciones/admin; rechazar anon, compras, finanzas, sin perfil e inactivo, incluso al llamar RPC directamente.
- [ ] **Step 2:** Implementar función `security invoker`, SQL fijo, revocación explícita de EXECUTE a PUBLIC/anon y concesión solo a authenticated; RLS y triggers siguen activos.
- [ ] **Step 3:** Bloquear receta, comparar versión y aplicar diff de cabecera, tamaños, líneas y cantidades en una transacción; conservar IDs de líneas existentes y rechazar IDs ajenos.
- [ ] **Step 4:** Incrementar versión también en cambios de componentes/cantidades/tamaños hechos por rutas directas; definir orden uniforme de bloqueos. Probar que edición directa invalida borrador anterior. Reutilizar bloqueo de ciclos existente sin introducir interbloqueos.
- [ ] **Step 5:** Probar rollback completo por cantidad inválida/ciclo, conflicto con versión vieja, preservación de precios de lista/manuales y bitácora con usuario real. Quitar tamaño debe limpiar dependencias y auditar cantidades antes de perder su vínculo con receta.
- [ ] **Step 6:** Ejecutar `npm test` + typecheck; commit `feat(db): guardado atómico y versiones de recetas`.

**Terminado:** Ninguna llamada deja una receta parcial o sobrescribe una versión obsoleta; no amplía permisos ni modifica fórmulas del Plan 1. PGlite verifica conflicto de versión secuencial; la concurrencia real de conexiones queda marcada para verificación Postgres por el usuario, sin afirmar cobertura que el arnés no ofrece.

### Task 6: Editor de productos con selectores

**Files:**
- Create: `components/recetas/editor-receta.tsx`, `components/recetas/selector-componente.tsx`, `app/(portal)/productos/nuevo/page.tsx`, `app/(portal)/productos/actions.ts`
- Modify: `app/(portal)/productos/[id]/page.tsx`, `lib/portal/recetas.ts`
- Test: `tests/portal/editor-receta.test.tsx`

**Interfaces:** Componente insumo/sub-receta por ID con búsqueda; categoría y tamaños por catálogo; cantidad por tamaño y unidad visible derivada del componente. Alta, edición, orden de líneas y desactivación. Validación compartida cliente/servidor.

- [ ] **Step 1:** Probar selección por teclado, ninguna relación por texto libre, números vacíos/negativos/no finitos, fila sin componente y duplicación de envío.
- [ ] **Step 2:** Implementar editor con borrador y RPC; tamaños nuevos sin precio; advertir consecuencias antes de quitar tamaño.
- [ ] **Step 3:** Mostrar componentes inactivos existentes sin borrarlos; impedir nuevas selecciones inactivas y autorreferencia; SQL sigue comprobando ciclos.
- [ ] **Step 4:** Mostrar costo preliminar etiquetado; después de guardar recargar vistas oficiales e invalidar consultas afectadas. Conflicto conserva captura y permite comparar/recargar, sin sobrescritura automática.
- [ ] **Step 5:** Pruebas específicas + typecheck; commit `feat(portal): editor de productos por catálogo`.

**Terminado:** Operaciones crea y edita una receta completa con dropdowns; otros roles consultan sin poder guardar recetas.

### Task 7: Sub-recetas y referencias de uso

**Files:**
- Create: `app/(portal)/subrecetas/page.tsx`, `app/(portal)/subrecetas/[id]/page.tsx`, `app/(portal)/subrecetas/nueva/page.tsx`, `components/recetas/usado-en.tsx`
- Modify: `components/recetas/editor-receta.tsx`, `lib/portal/consultas.ts`
- Test: `tests/portal/subrecetas.test.tsx`

**Interfaces:** Editor compartido con rendimiento > 0 y dropdown de unidad; cantidades sin tamaño; costo unitario SQL y lista de productos/sub-recetas afectados directa e indirectamente.

- [ ] **Step 1:** Probar rendimiento, unidades, anidación, ciclo rechazado y referencias indirectas sin duplicados.
- [ ] **Step 2:** Implementar lista, alta, edición y desactivación con aviso de impacto.
- [ ] **Step 3:** Verificar que guardar actualiza costo de productos dependientes consultando vistas; prueba SQL de integración con RPC.
- [ ] **Step 4:** Pruebas específicas + typecheck; commit `feat(portal): sub-recetas y dependencias`.

**Terminado:** Sub-recetas reutilizables conservan unidades y se editan mediante el mismo contrato atómico.

### Task 8: Precios por tamaño y canal

**Files:**
- Create: `lib/portal/precios.ts`, `components/recetas/editor-precios.tsx`
- Modify: `app/(portal)/productos/[id]/page.tsx`, `app/(portal)/productos/actions.ts`
- Test: `tests/portal/precios.test.ts`, `tests/portal/editor-precios.test.tsx`

**Interfaces:** Finanzas/admin actualiza precio de lista existente y crea/edita/quita `precio_canal_manual` en canales con regla castigado; eliminar manual vuelve al calculado. Guardados de precios separados del editor de receta.

- [ ] **Step 1:** Probar precio positivo/nulo, manual con nota, retiro de manual y prohibición en canales mostrador; rol ajeno y fila inexistente no producen éxito falso.
- [ ] **Step 2:** Implementar escritura con sesión y retorno comprobado; no enviar columnas inmutables en updates.
- [ ] **Step 3:** Refrescar ficha/resumen y mostrar ausencia de precio de lista aunque exista manual capturado.
- [ ] **Step 4:** Pruebas específicas y pruebas SQL de precios existentes; commit `feat(portal): edición de precios por Finanzas`.

**Terminado:** Se respetan separación de roles, precios migrados y bitácora existente.

### Task 9: Insumos

**Files:**
- Create: `app/(portal)/insumos/page.tsx`, `app/(portal)/insumos/actions.ts`, `lib/portal/insumos.ts`, `components/portal/editor-insumo.tsx`
- Test: `tests/portal/insumos.test.ts`, `tests/portal/editor-insumo.test.tsx`

**Interfaces:** Catálogo buscable/filtrable con alta/edición por compras/admin, proveedores/categorías/unidad seleccionados; costo unitario generado por SQL; filtro sin uso y productos afectados incluyendo sub-recetas anidadas.

- [ ] **Step 1:** Probar costo >= 0, presentación > 0, catálogos válidos y permisos; consumo indirecto cuenta como uso.
- [ ] **Step 2:** Implementar paginación, formulario y desactivación/reactivación; confirmar desactivación con lista de impacto.
- [ ] **Step 3:** Verificar recálculo SQL tras cambiar costo y mostrar errores conservando captura.
- [ ] **Step 4:** Pruebas específicas + typecheck; commit `feat(portal): administración de insumos`.

**Terminado:** Compras administra insumos sin carga masiva; los demás roles consultan y el costo se recalcula en Postgres.

### Task 10: Configuración y catálogos

**Files:**
- Create: `app/(portal)/configuracion/page.tsx`, `app/(portal)/configuracion/actions.ts`, `lib/portal/configuracion.ts`, `components/portal/configuracion.tsx`
- Test: `tests/portal/configuracion.test.ts`, `tests/portal/configuracion.test.tsx`

**Interfaces:** Parámetros/canales/tamaños por finanzas/admin; proveedores y categorías de insumo por compras/admin; categorías de producto por operaciones/admin. Tres canales fijos, sin alta/baja; catálogos desactivables cuando el esquema lo permite.

- [ ] **Step 1:** Probar rangos de IVA/margen/comisión, porcentajes UI ↔ fracciones SQL, envase, orden y permisos por sección.
- [ ] **Step 2:** Implementar cambios y avisos; confirmar comisión App propia explícitamente, sin hacerlo solo al abrir formulario.
- [ ] **Step 3:** Los tamaños solo se crean/editan: la tabla no tiene activo y no se añade desactivación ficticia. Relaciones previas con catálogos inactivos permanecen visibles.
- [ ] **Step 4:** Pruebas específicas + suite SQL de cálculo; commit `feat(portal): configuración por área`.

**Terminado:** Modificar configuración refresca valores oficiales sin guardar cálculos derivados.

### Task 11: Tablero e historial contextual

**Files:**
- Create: `app/(portal)/page.tsx`, `lib/portal/tablero.ts`, `components/portal/tablero.tsx`, `components/recetas/historial-receta.tsx`
- Modify: fichas de producto/sub-receta, `lib/portal/consultas.ts`
- Test: `tests/portal/tablero.test.ts`, `tests/portal/historial.test.tsx`

**Interfaces:** KPIs de productos activos y alertas enlazadas. Food cost promedio: media simple de filas producto/tamaño de Mostrador con precio, sin duplicar canales; avisar que no está ponderado por ventas. Conteos por producto distinto para falta de precio, margen bajo objetivo y pérdida en delivery. Historial por `bitacora.receta_id`, paginado.

- [ ] **Step 1:** Probar varios tamaños/canales, nulos y estados para evitar doble conteo; comisión pendiente siempre visible.
- [ ] **Step 2:** Implementar KPIs a partir de vistas y filtros claramente rotulados; no inferir alertas adicionales mediante fórmulas frontend.
- [ ] **Step 3:** Mostrar historial anterior/nuevo/usuario/fecha; los cambios históricos del Excel sin receta_id no se atribuyen artificialmente a productos.
- [ ] **Step 4:** Pruebas específicas + typecheck; commit `feat(portal): tablero e historial de recetas`.

**Terminado:** KPIs tienen definición visible y las fichas muestran su auditoría sin adelantar la pantalla general del Plan 3.

### Task 12: Verificación completa y documentación de entrega

**Files:**
- Modify: `README.md`, `.env.example`, este plan (estado de tareas)
- Create: `docs/portal/verificacion-plan-2.md`

**Interfaces:** Instrucciones de inicio local, variables públicas, manejo de usuarios en Supabase y lista de validaciones pendientes contra servicio real.

- [ ] **Step 1:** Aclarar roles del README y añadir SQL de primer admin para que lo ejecute el usuario con el ID/correo de su cuenta previamente creada.
- [ ] **Step 2:** Ejecutar toda la suite (`npm test`), `npm run typecheck` y `npm run build`; verificar rutas y teclado en navegador con datos sintéticos de pruebas. Nunca habilitar un modo de pruebas que eluda Auth en producción.
- [ ] **Step 3:** Revisar diff, permisos RPC, secretos, mensajes en español y consultas paginadas; comprobar que no se alteraron reporte ni importador.
- [ ] **Step 4:** Documentar configuración Cloud a cargo del usuario: registro desactivado, URLs permitidas de callback y variables del portal. Si publica nuevas migraciones, indicar `npx supabase db push` para que él lo corra, sin ejecutarlo.
- [ ] **Step 5:** Entregar guion de comprobación real: login de usuario creado, perfil inactivo, edición según rol, conflicto entre dos sesiones y rollback. Marcar estas comprobaciones como pendientes hasta recibir evidencia; PGlite no prueba Supabase Auth ni PostgREST ni todas las concurrencias reales.
- [ ] **Step 6:** Commit `docs(portal): ejecución y verificación del Plan 2`; entregar cambios en `plan-2-portal`, sin merge.

**Terminado:** Suite completa, tipos y build aprobados; limitaciones reales registradas y usuario puede revisar cada commit. La entrega local no se presenta como portal publicado ni validado contra Cloud.

## Cobertura del spec en este plan

| Spec | Task |
|---|---|
| §3 frontend y Auth | 1–3 |
| §5 resumen/ficha | 4, 6, 8 |
| §4.2 integridad y §8 concurrencia | 5–7 |
| §5 sub-recetas e insumos | 7, 9 |
| §5 configuración y §6 permisos | 2, 3, 8–10 |
| §2 comisión App propia pendiente | 4, 10, 11 |
| §5 tablero e historial contextual | 11 |
| Usuarios | 3 + operación manual del administrador, confirmado |
| Carga masiva, exportación, bitácora general, Vercel, e2e completos | Plan 3 |

## Puerta de aprobación

- [x] Responder decisiones de framework, roles, usuarios, orden y alcance; incorporadas en este documento.
- [ ] Usuario aprueba explícitamente el Plan 2.
- [ ] Solo entonces crear `plan-2-portal` y comenzar Task 1.

Hasta entonces, el único cambio autorizado y realizado es este documento de planificación.
