# Portal de Costeos The Coffee — Diseño

**Fecha:** 2026-10-05
**Estado:** Borrador para revisión
**Fuente:** `Modelo_Costeo_Corregido_2026.xlsx` (hojas Parametros, Resumen, Insumos, Recetario, Auditoria, Correcciones)

## 1. Objetivo

Reemplazar el Excel de costeo por un portal web multiusuario donde los datos viven en una base de datos y toda la captura se hace con dropdowns contra catálogos, eliminando el ligado por nombre escrito (`MATCH` por texto) que hoy puede dejar costos en $0 sin aviso.

**Criterios de éxito**
- Los 154 productos migrados reproducen el costo del Excel con tolerancia de $0.01.
- Margen, precio Rappi y alerta se calculan con las mismas reglas que el Excel (ver §4.3).
- Ningún insumo o sub-receta se captura como texto libre dentro de una receta.
- Todo cambio queda en bitácora con valor anterior, nuevo, usuario y fecha.

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Usuarios | Varias áreas con roles: Compras, Operaciones, Finanzas/Dirección, Admin |
| Infraestructura | Supabase (Postgres + Auth + RLS) + Vercel |
| Historial | Bitácora completa (anterior/nuevo/usuario/fecha). Sin cortes mensuales en v1 |
| Fuente de verdad | Migración única del Excel; después el portal es la única fuente. Carga masiva de costos por CSV/Excel. Exportación a Excel |
| Preparaciones | Sub-recetas reutilizables (anidables) |
| Canales | Fijos: Mostrador, Rappi, App propia (configurables en sus parámetros, no en número) |
| Tamaños | Configurables (Chica, Grande, Único, …) |
| Arquitectura | Cálculos en Postgres (vistas/funciones); el frontend solo muestra y captura |

**App propia:** precio de mostrador, con costo de envase y **comisión de pasarela de pago (% por confirmar)**. Se migra con `comision_pct = 0` y `comision_confirmada = false`; mientras no se confirme, el portal muestra un aviso "Comisión de App propia por confirmar" en el tablero, en Configuración y junto a los márgenes de ese canal. Finanzas la captura en Configuración → Canales y todo se recalcula. La cuota fija por transacción que cobran algunas pasarelas no se prorratea por producto en v1.

## 3. Arquitectura

- **Frontend:** Next.js (App Router) + TypeScript, Tailwind + shadcn/ui (Combobox con búsqueda para todos los dropdowns), TanStack Table.
- **Backend:** Supabase Postgres + Auth (correo) + Row Level Security.
- **Lógica:** migraciones SQL versionadas en `supabase/migrations` (tablas, vistas de cálculo, triggers de bitácora, políticas RLS).
- **Excel:** SheetJS para leer carga masiva y exportar resumen.
- **Hosting:** Vercel + Supabase Cloud.
- **Migración:** script Node/TypeScript en `scripts/migracion`.

```
supabase/migrations/   esquema, vistas, triggers, RLS
app/                   pantallas
lib/                   cliente Supabase, tipos generados, utilidades Excel
scripts/migracion/     importador + reporte de conciliación
tests/                 pgTAP (SQL) + Playwright (e2e)
```

El número oficial siempre sale de las vistas de Postgres. El editor de recetas puede mostrar un costo preliminar calculado en el cliente mientras se edita; al guardar se reemplaza por el de la base.

## 4. Modelo de datos

### 4.1 Tablas

**Configuración**
- `parametros` — fila única: `iva` (0.16), `margen_objetivo` (0.55).
- `canales` — `id, nombre, regla_precio ('mostrador'|'castigado'), comision_pct, comision_confirmada, costo_envase, markup_max_pct, orden`.
  Valores iniciales: Mostrador ('mostrador', 0, true, 0, null); Rappi ('castigado', 0.18, true, 6.14, 0.25); App propia ('mostrador', 0, **false**, 6.14, null).
  La comisión se aplica sobre la venta neta en todos los canales (misma base que Rappi en el Excel).
- `tamanos` — `id, nombre, orden`. Iniciales: Chica, Grande, Único.
- `unidades` — enum `gr | ml | pza`.

**Catálogos**
- `proveedores` — `id, nombre, activo`.
- `categorias_insumo` — `id, nombre, activo`.
- `categorias_producto` — `id, nombre, orden, activo`.

**Insumos**
- `insumos` — `id, nombre (único), proveedor_id, categoria_id, costo_paquete ≥ 0, presentacion > 0, unidad, activo, updated_at, updated_by`.
  `costo_unitario` = `costo_paquete / presentacion` (columna generada).

**Recetas**
- `recetas` — `id, nombre (único), tipo ('producto' | 'subreceta'), categoria_id (solo producto), rendimiento > 0 y unidad_rendimiento (solo subreceta), activo, version (bloqueo optimista)`.
- `receta_lineas` — `id, receta_id, insumo_id | subreceta_id (exactamente uno, CHECK), orden`.
- `linea_cantidades` — `linea_id, tamano_id (null para sub-recetas), cantidad ≥ 0`. PK (`linea_id`, `tamano_id`).
- `producto_tamanos` — `producto_id, tamano_id, precio_lista (con IVA, nullable)`. Define qué tamaños vende el producto.

**Seguridad y auditoría**
- `perfiles` — `user_id, nombre, rol ('compras'|'operaciones'|'finanzas'|'admin'), activo`.
- `bitacora` — `id, tabla, registro_id, campo, valor_anterior, valor_nuevo, usuario_id, fecha, origen ('portal'|'carga_masiva'|'migracion')`. Llenada por triggers `AFTER UPDATE/INSERT/DELETE` en todas las tablas de negocio.

### 4.2 Reglas de integridad
- Trigger que impide ciclos en sub-recetas (recorrido recursivo al insertar/actualizar `receta_lineas.subreceta_id`). Mensaje: "Mix X ya contiene a Y".
- No hay borrado físico de insumos ni recetas: se desactivan (`activo = false`). Los inactivos salen de los dropdowns pero conservan historial.
- Una línea de producto solo puede tener cantidades para tamaños presentes en `producto_tamanos` del producto.

### 4.3 Vistas de cálculo
1. **`v_costo_subreceta`** — costo por unidad de rendimiento = Σ(cantidad × costo unitario del componente) ÷ rendimiento. Recursiva (CTE) para sub-recetas anidadas.
2. **`v_costo_producto`** — por (producto, tamaño): Σ(cantidad × costo unitario de insumo o sub-receta).
3. **`v_resumen`** — por (producto, tamaño, canal), con `P` = precio_lista, `C` = costo, `iva`, y del canal `com`, `env`, `tope`:
   - Venta neta mostrador = `P / (1+iva)`; food cost = `C / venta_neta`; margen $ = `venta_neta − C`; margen % = `margen$ / venta_neta`.
   - Precio del canal según `canales.regla_precio`:
     - `'mostrador'` (Mostrador, App propia): precio canal = `P`.
     - `'castigado'` (Rappi): neutro = `ROUND(P/(1−com) + env·(1+iva)/(1−com), 0)`; tope = `ROUNDDOWN(P·(1+tope), 0)`; precio canal = `MIN(neutro, tope)`.
   - Para todos los canales:
     - Markup = `precio_canal / P − 1`
     - Margen $ canal = `precio_canal/(1+iva) − precio_canal/(1+iva)·com − C − env`
     - Margen % canal = `margen$ / (precio_canal/(1+iva))`
   - **Alerta** (primera que aplique, mismo orden que el Excel). Las alertas 1, 2, 5 y 6 se evalúan con los números de mostrador; la 3 y la 4 con los del canal de la fila:
     1. "Falta precio de lista" — sin precio
     2. "Vende por debajo del costo" — `C > venta_neta`
     3. "Markup sobre el tope" — `tope` no nulo y `markup > tope + 0.001`
     4. "Pierde dinero en el canal" — margen $ canal < 0
     5. "Margen bajo el objetivo" — `0 < margen % < margen_objetivo`
     6. "Usa insumo inactivo" — alguna línea apunta a insumo/sub-receta inactivo (nueva)

   **Diferencia intencional con el Excel:** el Excel calcula Rappi solo sobre el precio grande (o chico si no hay grande). El portal lo calcula por cada tamaño. La prueba de paridad compara el tamaño que usaba el Excel.

## 5. Pantallas

| # | Pantalla | Contenido |
|---|---|---|
| 1 | Tablero | KPIs (food cost promedio, # bajo objetivo, # sin precio, # pierden en delivery) + lista de alertas con link |
| 2 | Resumen de costeo | Tabla filtrable (categoría, canal, tamaño, alerta) + búsqueda; semáforo vs objetivo; exportar a Excel |
| 3 | Ficha de producto | Precios por tamaño, margen por canal, editor de receta (Combobox insumo/sub-receta + columna de cantidad por tamaño + costo en vivo), historial del producto |
| 4 | Sub-recetas | Lista y editor (igual a ficha) con rendimiento; "usado en" |
| 5 | Insumos | Catálogo editable con dropdowns; costo unitario; # productos que lo usan; filtro "sin uso" |
| 6 | Carga masiva | Subir CSV/Excel (nombre o id + costo_paquete [+ presentación]) → vista previa (anterior, nuevo, Δ%, productos afectados) → resolver no-coincidencias con dropdown → aplicar en una transacción |
| 7 | Bitácora | Filtros por usuario, fecha, tabla, producto |
| 8 | Configuración | Parámetros, canales, tamaños, proveedores, categorías |
| 9 | Usuarios | Invitar por correo, asignar rol, desactivar |

Idioma: español. Diseño para escritorio, consultable en celular.

## 6. Permisos (aplicados con RLS)

| | Compras | Operaciones | Finanzas | Admin |
|---|---|---|---|---|
| Leer todo | ✓ | ✓ | ✓ | ✓ |
| Insumos, proveedores, categorías de insumo, carga masiva | ✎ | | | ✎ |
| Recetas, sub-recetas, categorías de producto | | ✎ | | ✎ |
| Precios de lista (`producto_tamanos.precio_lista`) | | | ✎ | ✎ |
| Parámetros, canales, tamaños | | | ✎ | ✎ |
| Usuarios | | | | ✎ |

Nota: Operaciones define qué tamaños tiene un producto (filas de `producto_tamanos`); Finanzas solo edita la columna `precio_lista`.

## 7. Migración (script único)

1. **Lectura** de Parametros, Insumos, Recetario y precios de lista del Resumen. Auditoria y Correcciones se cargan a `bitacora` con `origen = 'migracion'`.
2. **Limpieza automática:** `pcs`→`pza`; normalización de mayúsculas/espacios; tabla de equivalencias de categorías de producto propuesta (p. ej. `SANDWICHES`/`Sandwiches` → Sandwiches; `GELATO FRAPPÉ`/`Gelato Frappés` → Gelato Frappés; 3 categorías Pumpkin Spice + Seasonal → Temporada) para aprobación; se descarta la columna "Clasificación" del Recetario (solo se usa `MIX` como pista).
3. **Tamaños:** si un producto tiene costo grande > 0 → Chica + Grande; si no → Único.
4. **Sub-recetas:** se agrupan las líneas `MIX` de cada producto por conjunto de ingredientes; grupos con proporciones consistentes entre productos se convierten en sub-receta con lote y rendimiento propuestos, y cada producto la referencia con la cantidad que reproduce exactamente su costo original. Grupos inconsistentes se quedan como ingredientes crudos y se listan para revisión.
5. **Reporte de migración (Excel):** equivalencias, sub-recetas propuestas, casos dudosos (fila sin nombre en Insumos, línea sin categoría en Recetario "Iced Chocolate → AGUA") y **conciliación** costo portal vs Excel por producto y tamaño.
6. **Carga** solo cuando la conciliación cuadra al 100% (±$0.01) y las equivalencias están aprobadas.

Se importan tal cual: los 50 insumos sin uso (activos) y los 55 productos sin precio (con su alerta).

## 8. Manejo de errores

| Caso | Comportamiento |
|---|---|
| Presentación 0, costos o cantidades negativas | CHECK en BD + validación en formulario |
| Ciclo de sub-recetas | Trigger lo bloquea con mensaje claro |
| Desactivar insumo en uso | Confirmación con lista de productos afectados; alerta "Usa insumo inactivo" |
| Edición concurrente de receta | Bloqueo optimista por `version`; aviso y recarga conservando lo capturado |
| Escritura sin permiso | RLS rechaza; UI muestra "No tienes permiso" |
| Carga masiva con filas inválidas | No se aplica nada hasta resolver todas; aplicación en una sola transacción |

## 9. Pruebas

1. **Paridad con Excel:** prueba automática que compara los 154 productos (costo, margen, precio Rappi, alerta) contra los valores del Excel.
2. **pgTAP:** fórmulas de cada vista, sub-recetas anidadas, bloqueo de ciclos, triggers de bitácora, RLS por rol.
3. **Playwright e2e:** Operaciones arma una receta con dropdowns; Compras hace carga masiva y ve impacto; Finanzas cambia IVA y todo se recalcula.

## 10. Fuera de alcance (v1)

Cortes/versiones mensuales, integración con POS o Rappi, canales adicionales, app móvil nativa.
