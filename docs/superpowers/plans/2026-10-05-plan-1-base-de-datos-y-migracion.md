# Plan 1 — Base de datos, cálculos y migración del Excel

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar la base de datos del portal de costeos lista y poblada: esquema, cálculos de costo/margen/canales, bitácora, permisos por rol y la migración del Excel con conciliación al centavo.

**Architecture:** Todo el modelo y los cálculos viven en Postgres (migraciones SQL de Supabase): tablas, vistas `security_invoker`, triggers de integridad y bitácora, y RLS por rol. Las pruebas corren contra PGlite (Postgres 18 en proceso, sin Docker) cargando las mismas migraciones más un *shim* que imita el esquema `auth` de Supabase. La migración es un script TypeScript que lee el Excel, construye un plan de carga puro, lo carga primero en PGlite para conciliar contra el Excel y solo entonces, con `--aplicar`, lo carga en Supabase.

**Tech Stack:** Node 24, TypeScript, Vitest, `@electric-sql/pglite`, `pg`, SheetJS (`xlsx` 0.20.3 desde cdn.sheetjs.com), `tsx`, Supabase CLI (`npx supabase`).

**Spec:** `docs/superpowers/specs/2026-10-05-portal-costeos-design.md`

**Este es el plan 1 de 3.** Plan 2: portal Next.js (login, pantallas, editor de recetas). Plan 3: carga masiva, exportación a Excel, pantalla de bitácora, despliegue en Vercel y pruebas e2e. Este plan produce software probado por sí solo: una base de datos con los 154 productos que cuadran contra el Excel.

## Global Constraints

- Idioma de nombres de negocio, mensajes de error y avisos: español.
- Postgres ≥ 15 (Supabase Cloud). Vistas con `with (security_invoker = true)`.
- Unidades permitidas: `gr | ml | pza` (`pcs` del Excel → `pza`).
- Parámetros iniciales: IVA 0.16, margen objetivo 0.55. Canales: Mostrador (`mostrador`, comisión 0, envase 0, sin tope); Rappi (`castigado`, 0.18, 6.14, tope 0.25); App propia (`mostrador`, 0, 6.14, sin tope, `comision_confirmada = false`).
- La comisión se aplica sobre la venta neta en todos los canales.
- Fórmulas: venta neta = `precio / (1 + iva)`; precio castigado = `MIN(ROUND(P/(1−com) + env·(1+iva)/(1−com), 0), ROUNDDOWN(P·(1+tope), 0))`; margen canal = `vn − vn·com − costo − env`.
- Orden de alertas: Falta precio de lista → Vende por debajo del costo → Markup sobre el tope → Pierde dinero en el canal → Margen bajo el objetivo → Usa insumo inactivo. Las alertas 1, 2, 5, 6 usan números de mostrador; 3 y 4 los del canal.
- No hay borrado físico de insumos, recetas, proveedores ni categorías (se desactivan).
- Tolerancia de conciliación de costo: ±$0.01 por producto y tamaño.
- Roles: `compras | operaciones | finanzas | admin`.
- El Excel de origen NO se versiona (`datos/*.xlsx` en `.gitignore`).
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Cambiar IVA, comisión o envase de un canal debe recalcular todos los márgenes al instante (nada calculado se guarda) → prueba en Task 5.
2. Un producto sin líneas, o con un tamaño sin cantidades, debe seguir apareciendo con costo 0 en vez de desaparecer del resumen → prueba en Task 4.
3. Quitar un tamaño a un producto debe borrar sus cantidades de ese tamaño, sin dejar huérfanos que sigan sumando costo → prueba en Task 3.
4. Correr la migración sobre una base que ya tiene datos debe abortar sin duplicar nada → prueba en Task 11.
5. Un insumo escrito en el Recetario con distintas mayúsculas o espacios que en el catálogo debe ligarse igual que lo hacía `MATCH` en Excel (sin distinguir mayúsculas) → prueba en Task 11.

---

## Estructura de archivos

```
package.json, tsconfig.json, vitest.config.ts, .gitignore
supabase/config.toml                                   (npx supabase init)
supabase/migrations/20261005000001_configuracion_catalogos.sql
supabase/migrations/20261005000002_recetas.sql
supabase/migrations/20261005000003_vistas_costo.sql
supabase/migrations/20261005000004_vistas_resumen.sql
supabase/migrations/20261005000005_perfiles_bitacora.sql
supabase/migrations/20261005000006_permisos.sql
scripts/db/shim-supabase.sql       imita auth.uid(), auth.users y roles de Supabase (solo local/pruebas)
scripts/db/pglite.ts               crearDbLocal(): PGlite con shim + migraciones
scripts/db/ejecutor.ts             interfaz Ejecutor (PGlite y pg la cumplen)
scripts/migracion/tipos.ts         tipos del Excel leído
scripts/migracion/leer-excel.ts    leerLibro(ruta)
scripts/migracion/equivalencias.ts mapa de categorías de producto
scripts/migracion/limpiar.ts       normalización de insumos, unidades, tamaños
scripts/migracion/subrecetas.ts    detectarSubrecetas()
scripts/migracion/plan-carga.ts    construirPlanCarga()
scripts/migracion/cargar.ts        cargarPlan()
scripts/migracion/conciliar.ts     conciliar()
scripts/migracion/reporte.ts       escribirReporte()
scripts/migracion/index.ts         CLI
tests/db/utilidades.ts             comoUsuario(), crearUsuario(), num()
tests/db/fabricas.ts               crearInsumo(), crearProducto(), crearSubreceta(), agregarLinea(), idTamano()
tests/db/*.test.ts
tests/migracion/fixture-libro.ts   escribe un Excel mínimo de prueba
tests/migracion/*.test.ts
datos/                             (ignorado) Excel origen y reporte
```

---

### Task 1: Proyecto, herramientas y arnés de pruebas con PGlite

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `supabase/` (vía CLI), `supabase/migrations/.gitkeep`, `scripts/db/shim-supabase.sql`, `scripts/db/pglite.ts`, `scripts/db/ejecutor.ts`, `tests/db/utilidades.ts`
- Test: `tests/db/arnes.test.ts`

**Interfaces:**
- Produces: `crearDbLocal(): Promise<PGlite>` (shim + todas las migraciones en orden); `interface Ejecutor { query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> }`; `comoUsuario<T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T>`; `num(v: unknown): number`.

- [ ] **Step 1: Inicializar paquete e instalar dependencias**

```bash
cd C:/Users/sebcm/Projects/thecoffee-costeos
npm init -y
npm pkg set type=module
npm pkg set private=true --json
npm pkg delete main
npm pkg set scripts.test="vitest run" scripts.typecheck="tsc --noEmit" scripts.migracion="tsx scripts/migracion/index.ts"
npm i pg https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
npm i -D typescript vitest tsx @electric-sql/pglite @types/node @types/pg
npx supabase init --yes
mkdir -p supabase/migrations scripts/db scripts/migracion tests/db tests/migracion datos
touch supabase/migrations/.gitkeep
```

Si `npx supabase init` pregunta por VS Code/IntelliJ settings, responder `N`.

- [ ] **Step 2: Configuración de TypeScript, Vitest y git**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["scripts", "tests", "vitest.config.ts"]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
```

`.gitignore`:
```
node_modules/
datos/*.xlsx
.env
.env.*
supabase/.temp/
supabase/.branches/
```

- [ ] **Step 3: Copiar el Excel de origen (no se versiona)**

```bash
cp "C:/Users/sebcm/Downloads/Modelo_Costeo_Corregido_2026.xlsx" datos/
```

- [ ] **Step 4: Shim de Supabase, base local y Ejecutor**

`scripts/db/shim-supabase.sql`:
```sql
-- Imita lo mínimo de Supabase que usan las migraciones. Solo para PGlite (pruebas y conciliación local).
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
```

`scripts/db/ejecutor.ts`:
```ts
/** Lo mínimo que necesitan los scripts: PGlite y pg.Client lo cumplen. */
export interface Ejecutor {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
```

`scripts/db/pglite.ts`:
```ts
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Postgres en proceso con el shim de Supabase y todas las migraciones aplicadas en orden. */
export async function crearDbLocal(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(readFileSync(join(raiz, 'scripts/db/shim-supabase.sql'), 'utf8'));
  const carpeta = join(raiz, 'supabase/migrations');
  const archivos = readdirSync(carpeta).filter((f) => f.endsWith('.sql')).sort();
  for (const archivo of archivos) {
    await db.exec(readFileSync(join(carpeta, archivo), 'utf8'));
  }
  return db;
}
```

`tests/db/utilidades.ts`:
```ts
import type { PGlite } from '@electric-sql/pglite';

export const num = (v: unknown): number => Number(v);

/** Ejecuta fn como el rol `authenticated` de Supabase con auth.uid() = userId. */
export async function comoUsuario<T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
  await db.exec('set role authenticated');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}
```

- [ ] **Step 5: Escribir la prueba del arnés**

`tests/db/arnes.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario } from './utilidades';

describe('arnés PGlite', () => {
  it('auth.uid() es null sin sesión y toma el usuario dentro de comoUsuario', async () => {
    const db = await crearDbLocal();
    const sinSesion = await db.query<{ uid: string | null }>('select auth.uid() as uid');
    expect(sinSesion.rows[0].uid).toBeNull();
    const id = '00000000-0000-0000-0000-000000000001';
    const dentro = await comoUsuario(db, id, () =>
      db.query<{ uid: string; rol: string }>('select auth.uid() as uid, current_user as rol'),
    );
    expect(dentro.rows[0]).toEqual({ uid: id, rol: 'authenticated' });
    const despues = await db.query<{ rol: string }>('select current_user as rol');
    expect(despues.rows[0].rol).not.toBe('authenticated');
  });
});
```

- [ ] **Step 6: Correr la prueba**

Run: `npx vitest run tests/db/arnes.test.ts`
Expected: PASS (1 test). Si falla por la carpeta de migraciones vacía, revisar que exista `supabase/migrations/.gitkeep`.

- [ ] **Step 7: Typecheck y commit**

Run: `npm run typecheck` → sin errores.

```bash
git add -A
git commit -m "chore: proyecto base con PGlite, Vitest y Supabase CLI

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Esquema de configuración, catálogos e insumos

**Files:**
- Create: `supabase/migrations/20261005000001_configuracion_catalogos.sql`, `tests/db/fabricas.ts`
- Test: `tests/db/catalogos.test.ts`

**Interfaces:**
- Consumes: `crearDbLocal`, `num`.
- Produces: tablas `parametros(id=1, iva, margen_objetivo, updated_at, updated_by)`, `canales(id, nombre, regla_precio, comision_pct, comision_confirmada, costo_envase, markup_max_pct, orden, updated_at, updated_by)`, `tamanos(id, nombre, orden)`, `proveedores(id, nombre, activo)`, `categorias_insumo(id, nombre, activo)`, `categorias_producto(id, nombre, orden, activo)`, `insumos(id, nombre, proveedor_id, categoria_id, costo_paquete, presentacion, unidad, costo_unitario, activo, updated_at, updated_by)`; tipo `unidad`; función `tocar_updated_at()`. Fábrica `crearInsumo(db, { nombre, costoPaquete, presentacion, unidad?, activo? }): Promise<string>`; `type NombreTamano = 'Único' | 'Chica' | 'Grande'`.

- [ ] **Step 1: Escribir la prueba**

`tests/db/catalogos.test.ts`:
```ts
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { crearInsumo } from './fabricas';
import { num } from './utilidades';

let db: PGlite;
beforeAll(async () => { db = await crearDbLocal(); });

describe('configuración inicial', () => {
  it('trae IVA 16% y margen objetivo 55%', async () => {
    const r = await db.query<{ iva: string; margen_objetivo: string }>('select iva, margen_objetivo from parametros');
    expect(r.rows).toHaveLength(1);
    expect(num(r.rows[0].iva)).toBe(0.16);
    expect(num(r.rows[0].margen_objetivo)).toBe(0.55);
  });

  it('trae los 3 canales con sus reglas', async () => {
    const r = await db.query<Record<string, unknown>>(
      'select nombre, regla_precio, comision_pct, comision_confirmada, costo_envase, markup_max_pct from canales order by orden',
    );
    expect(r.rows.map((c) => [c.nombre, c.regla_precio, num(c.comision_pct), c.comision_confirmada, num(c.costo_envase), c.markup_max_pct === null ? null : num(c.markup_max_pct)])).toEqual([
      ['Mostrador', 'mostrador', 0, true, 0, null],
      ['Rappi', 'castigado', 0.18, true, 6.14, 0.25],
      ['App propia', 'mostrador', 0, false, 6.14, null],
    ]);
  });

  it('trae los tamaños Único, Chica y Grande', async () => {
    const r = await db.query<{ nombre: string }>('select nombre from tamanos order by orden');
    expect(r.rows.map((t) => t.nombre)).toEqual(['Único', 'Chica', 'Grande']);
  });

  it('solo permite una fila de parámetros', async () => {
    await expect(db.query('insert into parametros (id, iva, margen_objetivo) values (2, 0.16, 0.5)')).rejects.toThrow();
  });
});

describe('insumos', () => {
  it('calcula el costo unitario como costo del paquete entre presentación, sin redondear', async () => {
    const id = await crearInsumo(db, { nombre: 'QUESO GOUDA', costoPaquete: 524.8, presentacion: 3280 });
    const r = await db.query<{ costo_unitario: string }>('select costo_unitario from insumos where id = $1', [id]);
    expect(num(r.rows[0].costo_unitario)).toBeCloseTo(0.16, 10);
  });

  it('rechaza presentación 0, costos negativos, nombres vacíos y nombres repetidos', async () => {
    await expect(crearInsumo(db, { nombre: 'X0', costoPaquete: 10, presentacion: 0 })).rejects.toThrow();
    await expect(crearInsumo(db, { nombre: 'X1', costoPaquete: -1, presentacion: 1 })).rejects.toThrow();
    await expect(crearInsumo(db, { nombre: '  ', costoPaquete: 1, presentacion: 1 })).rejects.toThrow();
    await crearInsumo(db, { nombre: 'LECHE ENTERA', costoPaquete: 25, presentacion: 1000, unidad: 'ml' });
    await expect(crearInsumo(db, { nombre: 'LECHE ENTERA', costoPaquete: 25, presentacion: 1000, unidad: 'ml' })).rejects.toThrow();
  });

  it('rechaza unidades fuera de gr, ml, pza', async () => {
    await expect(
      db.query(`insert into insumos (nombre, proveedor_id, categoria_id, costo_paquete, presentacion, unidad)
                select 'Y', p.id, c.id, 1, 1, 'pcs' from proveedores p, categorias_insumo c limit 1`),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Escribir la fábrica de insumos**

`tests/db/fabricas.ts`:
```ts
import type { PGlite } from '@electric-sql/pglite';

export type NombreTamano = 'Único' | 'Chica' | 'Grande';

async function idCatalogo(db: PGlite, tabla: 'proveedores' | 'categorias_insumo' | 'categorias_producto', nombre: string): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into ${tabla} (nombre) values ($1)
     on conflict (nombre) do update set nombre = excluded.nombre
     returning id`,
    [nombre],
  );
  return r.rows[0].id;
}

export async function crearInsumo(
  db: PGlite,
  o: { nombre: string; costoPaquete: number; presentacion: number; unidad?: 'gr' | 'ml' | 'pza'; activo?: boolean },
): Promise<string> {
  const proveedor = await idCatalogo(db, 'proveedores', 'PROVEEDOR PRUEBA');
  const categoria = await idCatalogo(db, 'categorias_insumo', 'CATEGORIA PRUEBA');
  const r = await db.query<{ id: string }>(
    `insert into insumos (nombre, proveedor_id, categoria_id, costo_paquete, presentacion, unidad, activo)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [o.nombre, proveedor, categoria, o.costoPaquete, o.presentacion, o.unidad ?? 'gr', o.activo ?? true],
  );
  return r.rows[0].id;
}
```

- [ ] **Step 3: Correr la prueba para verificar que falla**

Run: `npx vitest run tests/db/catalogos.test.ts`
Expected: FAIL con `relation "parametros" does not exist`.

- [ ] **Step 4: Escribir la migración**

`supabase/migrations/20261005000001_configuracion_catalogos.sql`:
```sql
create type unidad as enum ('gr', 'ml', 'pza');

create function tocar_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create table parametros (
  id smallint primary key default 1 check (id = 1),
  iva numeric not null check (iva >= 0 and iva < 1),
  margen_objetivo numeric not null check (margen_objetivo >= 0 and margen_objetivo < 1),
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into parametros (iva, margen_objetivo) values (0.16, 0.55);
create trigger parametros_updated before update on parametros for each row execute function tocar_updated_at();

create table canales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  regla_precio text not null check (regla_precio in ('mostrador', 'castigado')),
  comision_pct numeric not null default 0 check (comision_pct >= 0 and comision_pct < 1),
  comision_confirmada boolean not null default true,
  costo_envase numeric not null default 0 check (costo_envase >= 0),
  markup_max_pct numeric check (markup_max_pct >= 0),
  orden smallint not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into canales (nombre, regla_precio, comision_pct, comision_confirmada, costo_envase, markup_max_pct, orden) values
  ('Mostrador', 'mostrador', 0, true, 0, null, 1),
  ('Rappi', 'castigado', 0.18, true, 6.14, 0.25, 2),
  ('App propia', 'mostrador', 0, false, 6.14, null, 3);
create trigger canales_updated before update on canales for each row execute function tocar_updated_at();

create table tamanos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (btrim(nombre) <> ''),
  orden smallint not null
);
insert into tamanos (nombre, orden) values ('Único', 0), ('Chica', 1), ('Grande', 2);

create table proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (btrim(nombre) <> ''),
  activo boolean not null default true
);

create table categorias_insumo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (btrim(nombre) <> ''),
  activo boolean not null default true
);

create table categorias_producto (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (btrim(nombre) <> ''),
  orden smallint not null default 0,
  activo boolean not null default true
);

create table insumos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (btrim(nombre) <> ''),
  proveedor_id uuid not null references proveedores(id),
  categoria_id uuid not null references categorias_insumo(id),
  costo_paquete numeric not null check (costo_paquete >= 0),
  presentacion numeric not null check (presentacion > 0),
  unidad unidad not null,
  costo_unitario numeric generated always as (costo_paquete / presentacion) stored,
  activo boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
create trigger insumos_updated before update on insumos for each row execute function tocar_updated_at();
```

- [ ] **Step 5: Correr la prueba**

Run: `npx vitest run tests/db/catalogos.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): configuración, catálogos e insumos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Esquema de recetas, sub-recetas e integridad

**Files:**
- Create: `supabase/migrations/20261005000002_recetas.sql`
- Modify: `tests/db/fabricas.ts` (agregar fábricas de recetas)
- Test: `tests/db/recetas.test.ts`

**Interfaces:**
- Consumes: tablas de Task 2, `crearInsumo`.
- Produces: tablas `recetas(id, nombre, tipo, categoria_id, rendimiento, unidad_rendimiento, activo, version, updated_at, updated_by)`, `producto_tamanos(producto_id, tamano_id, precio_lista)`, `receta_lineas(id, receta_id, insumo_id, subreceta_id, orden)`, `linea_cantidades(linea_id, tamano_id, cantidad)`. Fábricas: `idTamano(db, NombreTamano): Promise<string>`, `crearProducto(db, { nombre, precios: Partial<Record<NombreTamano, number | null>>, categoria? }): Promise<string>`, `crearSubreceta(db, { nombre, rendimiento, unidad? }): Promise<string>`, `agregarLinea(db, recetaId, { insumoId?, subrecetaId?, cantidades: Partial<Record<NombreTamano, number>> | number }): Promise<string>` (un `number` = cantidad de sub-receta, sin tamaño).

- [ ] **Step 1: Agregar fábricas de recetas**

Agregar al final de `tests/db/fabricas.ts`:
```ts
export async function idTamano(db: PGlite, nombre: NombreTamano): Promise<string> {
  const r = await db.query<{ id: string }>('select id from tamanos where nombre = $1', [nombre]);
  if (!r.rows[0]) throw new Error(`No existe el tamaño ${nombre}`);
  return r.rows[0].id;
}

export async function crearProducto(
  db: PGlite,
  o: { nombre: string; precios: Partial<Record<NombreTamano, number | null>>; categoria?: string },
): Promise<string> {
  const categoria = await idCatalogo(db, 'categorias_producto', o.categoria ?? 'CATEGORIA PRODUCTO PRUEBA');
  const r = await db.query<{ id: string }>(
    `insert into recetas (nombre, tipo, categoria_id) values ($1, 'producto', $2) returning id`,
    [o.nombre, categoria],
  );
  const id = r.rows[0].id;
  for (const [tamano, precio] of Object.entries(o.precios) as [NombreTamano, number | null][]) {
    await db.query('insert into producto_tamanos (producto_id, tamano_id, precio_lista) values ($1, $2, $3)', [
      id, await idTamano(db, tamano), precio,
    ]);
  }
  return id;
}

export async function crearSubreceta(
  db: PGlite,
  o: { nombre: string; rendimiento: number; unidad?: 'gr' | 'ml' | 'pza' },
): Promise<string> {
  const r = await db.query<{ id: string }>(
    `insert into recetas (nombre, tipo, rendimiento, unidad_rendimiento) values ($1, 'subreceta', $2, $3) returning id`,
    [o.nombre, o.rendimiento, o.unidad ?? 'ml'],
  );
  return r.rows[0].id;
}

export async function agregarLinea(
  db: PGlite,
  recetaId: string,
  o: { insumoId?: string; subrecetaId?: string; cantidades: Partial<Record<NombreTamano, number>> | number },
): Promise<string> {
  const r = await db.query<{ id: string }>(
    'insert into receta_lineas (receta_id, insumo_id, subreceta_id) values ($1, $2, $3) returning id',
    [recetaId, o.insumoId ?? null, o.subrecetaId ?? null],
  );
  const lineaId = r.rows[0].id;
  if (typeof o.cantidades === 'number') {
    await db.query('insert into linea_cantidades (linea_id, tamano_id, cantidad) values ($1, null, $2)', [lineaId, o.cantidades]);
  } else {
    for (const [tamano, cantidad] of Object.entries(o.cantidades) as [NombreTamano, number][]) {
      await db.query('insert into linea_cantidades (linea_id, tamano_id, cantidad) values ($1, $2, $3)', [
        lineaId, await idTamano(db, tamano), cantidad,
      ]);
    }
  }
  return lineaId;
}
```

- [ ] **Step 2: Escribir la prueba**

`tests/db/recetas.test.ts`:
```ts
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { agregarLinea, crearInsumo, crearProducto, crearSubreceta, idTamano } from './fabricas';
import { num } from './utilidades';

let db: PGlite;
let cafe: string;
beforeAll(async () => {
  db = await crearDbLocal();
  cafe = await crearInsumo(db, { nombre: 'CAFE', costoPaquete: 400, presentacion: 1000 });
});

describe('recetas', () => {
  it('una línea lleva exactamente un insumo o una sub-receta', async () => {
    const p = await crearProducto(db, { nombre: 'P línea', precios: { Único: 50 } });
    await expect(db.query('insert into receta_lineas (receta_id) values ($1)', [p])).rejects.toThrow();
    const s = await crearSubreceta(db, { nombre: 'S línea', rendimiento: 100 });
    await expect(
      db.query('insert into receta_lineas (receta_id, insumo_id, subreceta_id) values ($1, $2, $3)', [p, cafe, s]),
    ).rejects.toThrow();
  });

  it('no permite usar un producto como si fuera sub-receta', async () => {
    const p1 = await crearProducto(db, { nombre: 'P uno', precios: { Único: 50 } });
    const p2 = await crearProducto(db, { nombre: 'P dos', precios: { Único: 50 } });
    await expect(agregarLinea(db, p1, { subrecetaId: p2, cantidades: { Único: 1 } })).rejects.toThrow(/sub-recetas/);
  });

  it('bloquea ciclos entre sub-recetas con un mensaje claro', async () => {
    const a = await crearSubreceta(db, { nombre: 'Mix A', rendimiento: 100 });
    const b = await crearSubreceta(db, { nombre: 'Mix B', rendimiento: 100 });
    await agregarLinea(db, a, { subrecetaId: b, cantidades: 10 });
    await expect(agregarLinea(db, b, { subrecetaId: a, cantidades: 10 })).rejects.toThrow('Mix A ya contiene a Mix B');
    await expect(agregarLinea(db, a, { subrecetaId: a, cantidades: 10 })).rejects.toThrow('ya contiene a Mix A');
  });

  it('solo acepta cantidades en tamaños que vende el producto', async () => {
    const p = await crearProducto(db, { nombre: 'P chica', precios: { Chica: 50 } });
    await expect(agregarLinea(db, p, { insumoId: cafe, cantidades: { Grande: 20 } })).rejects.toThrow(/no se vende en ese tamaño/);
  });

  it('las cantidades de sub-receta no llevan tamaño y las de producto sí', async () => {
    const s = await crearSubreceta(db, { nombre: 'S tamaños', rendimiento: 100 });
    await expect(agregarLinea(db, s, { insumoId: cafe, cantidades: { Chica: 1 } })).rejects.toThrow(/no llevan tamaño/);
    const p = await crearProducto(db, { nombre: 'P sin tamaño', precios: { Chica: 50 } });
    await expect(agregarLinea(db, p, { insumoId: cafe, cantidades: 5 })).rejects.toThrow(/Indica el tamaño/);
  });

  it('no repite cantidad para la misma línea y tamaño (incluido el null de sub-receta)', async () => {
    const s = await crearSubreceta(db, { nombre: 'S dup', rendimiento: 100 });
    const linea = await agregarLinea(db, s, { insumoId: cafe, cantidades: 5 });
    await expect(db.query('insert into linea_cantidades (linea_id, tamano_id, cantidad) values ($1, null, 6)', [linea])).rejects.toThrow();
  });

  it('quitar un tamaño al producto borra sus cantidades de ese tamaño', async () => {
    const p = await crearProducto(db, { nombre: 'P quitar tamaño', precios: { Chica: 50, Grande: 60 } });
    const linea = await agregarLinea(db, p, { insumoId: cafe, cantidades: { Chica: 18, Grande: 20 } });
    await db.query('delete from producto_tamanos where producto_id = $1 and tamano_id = $2', [p, await idTamano(db, 'Grande')]);
    const r = await db.query<{ cantidad: string }>('select cantidad from linea_cantidades where linea_id = $1', [linea]);
    expect(r.rows.map((x) => num(x.cantidad))).toEqual([18]);
  });

  it('sube la versión de la receta en cada cambio y no deja cambiar su tipo', async () => {
    const p = await crearProducto(db, { nombre: 'P versión', precios: { Único: 50 } });
    await db.query(`update recetas set nombre = 'P versión 2' where id = $1`, [p]);
    const r = await db.query<{ version: number }>('select version from recetas where id = $1', [p]);
    expect(r.rows[0].version).toBe(2);
    await expect(db.query(`update recetas set tipo = 'subreceta', rendimiento = 1, unidad_rendimiento = 'ml', categoria_id = null where id = $1`, [p])).rejects.toThrow(/tipo/);
  });

  it('valida campos según el tipo de receta', async () => {
    await expect(db.query(`insert into recetas (nombre, tipo) values ('Sin categoría', 'producto')`)).rejects.toThrow();
    await expect(db.query(`insert into recetas (nombre, tipo) values ('Sin rendimiento', 'subreceta')`)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Correr la prueba para verificar que falla**

Run: `npx vitest run tests/db/recetas.test.ts`
Expected: FAIL con `relation "recetas" does not exist`.

- [ ] **Step 4: Escribir la migración**

`supabase/migrations/20261005000002_recetas.sql`:
```sql
create table recetas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (btrim(nombre) <> ''),
  tipo text not null check (tipo in ('producto', 'subreceta')),
  categoria_id uuid references categorias_producto(id),
  rendimiento numeric check (rendimiento > 0),
  unidad_rendimiento unidad,
  activo boolean not null default true,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  check (
    (tipo = 'producto' and categoria_id is not null and rendimiento is null and unidad_rendimiento is null)
    or (tipo = 'subreceta' and rendimiento is not null and unidad_rendimiento is not null)
  )
);

create function antes_de_actualizar_receta() returns trigger language plpgsql as $$
begin
  if new.tipo <> old.tipo then
    raise exception 'No se puede cambiar el tipo de una receta';
  end if;
  new.version := old.version + 1;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger recetas_antes_update before update on recetas for each row execute function antes_de_actualizar_receta();

create table producto_tamanos (
  producto_id uuid not null references recetas(id) on delete cascade,
  tamano_id uuid not null references tamanos(id),
  precio_lista numeric check (precio_lista > 0),
  primary key (producto_id, tamano_id)
);

create function validar_producto_tamano() returns trigger language plpgsql as $$
begin
  if (select tipo from recetas where id = new.producto_id) is distinct from 'producto' then
    raise exception 'Solo los productos tienen tamaños y precio de lista';
  end if;
  return new;
end $$;
create trigger producto_tamanos_validar before insert or update on producto_tamanos
  for each row execute function validar_producto_tamano();

create table receta_lineas (
  id uuid primary key default gen_random_uuid(),
  receta_id uuid not null references recetas(id) on delete cascade,
  insumo_id uuid references insumos(id),
  subreceta_id uuid references recetas(id),
  orden integer not null default 0,
  check (num_nonnulls(insumo_id, subreceta_id) = 1)
);
create index receta_lineas_receta on receta_lineas (receta_id);
create index receta_lineas_insumo on receta_lineas (insumo_id);
create index receta_lineas_subreceta on receta_lineas (subreceta_id);

create function validar_receta_linea() returns trigger language plpgsql as $$
declare
  v_tipo text;
  v_ciclo boolean;
begin
  if new.subreceta_id is null then
    return new;
  end if;
  select tipo into v_tipo from recetas where id = new.subreceta_id;
  if v_tipo is distinct from 'subreceta' then
    raise exception 'Solo se pueden usar sub-recetas como componente';
  end if;
  with recursive contenidas (id) as (
    select new.subreceta_id
    union
    select l.subreceta_id
    from receta_lineas l
    join contenidas c on l.receta_id = c.id
    where l.subreceta_id is not null
  )
  select exists (select 1 from contenidas where id = new.receta_id) into v_ciclo;
  if v_ciclo then
    raise exception '% ya contiene a %',
      (select nombre from recetas where id = new.subreceta_id),
      (select nombre from recetas where id = new.receta_id);
  end if;
  return new;
end $$;
create trigger receta_lineas_validar before insert or update on receta_lineas
  for each row execute function validar_receta_linea();

create table linea_cantidades (
  linea_id uuid not null references receta_lineas(id) on delete cascade,
  tamano_id uuid references tamanos(id),
  cantidad numeric not null check (cantidad >= 0)
);
create unique index linea_cantidades_unica on linea_cantidades (linea_id, tamano_id) nulls not distinct;

create function validar_linea_cantidad() returns trigger language plpgsql as $$
declare
  v_receta uuid;
  v_tipo text;
begin
  select l.receta_id, r.tipo into v_receta, v_tipo
  from receta_lineas l join recetas r on r.id = l.receta_id
  where l.id = new.linea_id;
  if v_tipo = 'subreceta' then
    if new.tamano_id is not null then
      raise exception 'Las cantidades de una sub-receta no llevan tamaño';
    end if;
  else
    if new.tamano_id is null then
      raise exception 'Indica el tamaño de la cantidad';
    end if;
    if not exists (select 1 from producto_tamanos where producto_id = v_receta and tamano_id = new.tamano_id) then
      raise exception 'El producto no se vende en ese tamaño';
    end if;
  end if;
  return new;
end $$;
create trigger linea_cantidades_validar before insert or update on linea_cantidades
  for each row execute function validar_linea_cantidad();

create function limpiar_cantidades_de_tamano() returns trigger language plpgsql as $$
begin
  delete from linea_cantidades lc
  using receta_lineas l
  where lc.linea_id = l.id and l.receta_id = old.producto_id and lc.tamano_id = old.tamano_id;
  return old;
end $$;
create trigger producto_tamanos_limpiar after delete on producto_tamanos
  for each row execute function limpiar_cantidades_de_tamano();
```

- [ ] **Step 5: Correr las pruebas**

Run: `npx vitest run tests/db`
Expected: PASS (todas, incluidas las de Task 1 y 2).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): recetas, sub-recetas, tamaños e integridad

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Vistas de costo (sub-recetas recursivas y productos)

**Files:**
- Create: `supabase/migrations/20261005000003_vistas_costo.sql`
- Test: `tests/db/costos.test.ts`

**Interfaces:**
- Consumes: tablas de Task 2–3, fábricas.
- Produces: vista `v_costo_subreceta(subreceta_id, costo_unitario, usa_inactivo)`; vista `v_costo_producto(producto_id, tamano_id, costo, usa_inactivo)` con una fila por cada `producto_tamanos`.

- [ ] **Step 1: Escribir la prueba**

`tests/db/costos.test.ts`:
```ts
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { agregarLinea, crearInsumo, crearProducto, crearSubreceta, idTamano } from './fabricas';
import { num } from './utilidades';

let db: PGlite;
const costo = async (productoId: string, tamano: 'Único' | 'Chica' | 'Grande') => {
  const r = await db.query<{ costo: string; usa_inactivo: boolean }>(
    'select costo, usa_inactivo from v_costo_producto where producto_id = $1 and tamano_id = $2',
    [productoId, await idTamano(db, tamano)],
  );
  return { costo: num(r.rows[0].costo), usaInactivo: r.rows[0].usa_inactivo };
};

beforeAll(async () => { db = await crearDbLocal(); });

describe('v_costo_producto', () => {
  it('suma cantidad × costo unitario por tamaño', async () => {
    const cafe = await crearInsumo(db, { nombre: 'CAFE', costoPaquete: 400, presentacion: 1000 });
    const vaso = await crearInsumo(db, { nombre: 'VASO', costoPaquete: 100, presentacion: 50, unidad: 'pza' });
    const p = await crearProducto(db, { nombre: 'Latte', precios: { Chica: 65, Grande: 75 } });
    await agregarLinea(db, p, { insumoId: cafe, cantidades: { Chica: 18, Grande: 20 } });
    await agregarLinea(db, p, { insumoId: vaso, cantidades: { Chica: 1, Grande: 1 } });
    expect((await costo(p, 'Chica')).costo).toBeCloseTo(9.2, 10);
    expect((await costo(p, 'Grande')).costo).toBeCloseTo(10, 10);
  });

  it('usa el costo por unidad de rendimiento de la sub-receta', async () => {
    const matcha = await crearInsumo(db, { nombre: 'MATCHA', costoPaquete: 1200, presentacion: 1000 });
    const agua = await crearInsumo(db, { nombre: 'AGUA', costoPaquete: 0, presentacion: 1, unidad: 'ml' });
    const mix = await crearSubreceta(db, { nombre: 'Mix Matcha', rendimiento: 1000 });
    await agregarLinea(db, mix, { insumoId: matcha, cantidades: 107.2 });
    await agregarLinea(db, mix, { insumoId: agua, cantidades: 892.8 });
    const p = await crearProducto(db, { nombre: 'Matcha Latte', precios: { Único: 70 } });
    await agregarLinea(db, p, { subrecetaId: mix, cantidades: { Único: 36 } });
    const r = await db.query<{ costo_unitario: string }>('select costo_unitario from v_costo_subreceta where subreceta_id = $1', [mix]);
    expect(num(r.rows[0].costo_unitario)).toBeCloseTo(0.12864, 10);
    expect((await costo(p, 'Único')).costo).toBeCloseTo(4.63104, 10);
  });

  it('resuelve sub-recetas anidadas', async () => {
    const azucar = await crearInsumo(db, { nombre: 'AZUCAR', costoPaquete: 50, presentacion: 1000 });
    const cafe2 = await crearInsumo(db, { nombre: 'CAFE 2', costoPaquete: 400, presentacion: 1000 });
    const jarabe = await crearSubreceta(db, { nombre: 'Jarabe', rendimiento: 100 });
    await agregarLinea(db, jarabe, { insumoId: azucar, cantidades: 100 });       // 5 / 100 ml = 0.05
    const mix = await crearSubreceta(db, { nombre: 'Mix Dulce', rendimiento: 200 });
    await agregarLinea(db, mix, { subrecetaId: jarabe, cantidades: 50 });        // 2.5
    await agregarLinea(db, mix, { insumoId: cafe2, cantidades: 10 });            // 4   → 6.5 / 200 = 0.0325
    const p = await crearProducto(db, { nombre: 'Dulce', precios: { Único: 60 } });
    await agregarLinea(db, p, { subrecetaId: mix, cantidades: { Único: 100 } });
    expect((await costo(p, 'Único')).costo).toBeCloseTo(3.25, 10);
  });

  it('un producto sin líneas o un tamaño sin cantidades aparece con costo 0', async () => {
    const vacio = await crearProducto(db, { nombre: 'Vacío', precios: { Único: 30 } });
    expect(await costo(vacio, 'Único')).toEqual({ costo: 0, usaInactivo: false });
    const cafe3 = await crearInsumo(db, { nombre: 'CAFE 3', costoPaquete: 400, presentacion: 1000 });
    const solochica = await crearProducto(db, { nombre: 'Solo chica', precios: { Chica: 30, Grande: 40 } });
    await agregarLinea(db, solochica, { insumoId: cafe3, cantidades: { Chica: 10 } });
    expect((await costo(solochica, 'Grande')).costo).toBe(0);
  });

  it('se recalcula al cambiar el costo de un insumo y marca insumos inactivos, también dentro de sub-recetas', async () => {
    const leche = await crearInsumo(db, { nombre: 'LECHE', costoPaquete: 20, presentacion: 1000, unidad: 'ml' });
    const base = await crearSubreceta(db, { nombre: 'Base Leche', rendimiento: 100 });
    await agregarLinea(db, base, { insumoId: leche, cantidades: 100 });
    const p = await crearProducto(db, { nombre: 'Con Base', precios: { Único: 40 } });
    await agregarLinea(db, p, { subrecetaId: base, cantidades: { Único: 200 } });
    expect((await costo(p, 'Único')).costo).toBeCloseTo(4, 10);
    await db.query('update insumos set costo_paquete = 30 where id = $1', [leche]);
    expect((await costo(p, 'Único')).costo).toBeCloseTo(6, 10);
    await db.query('update insumos set activo = false where id = $1', [leche]);
    expect((await costo(p, 'Único')).usaInactivo).toBe(true);
  });
});
```

- [ ] **Step 2: Correr la prueba para verificar que falla**

Run: `npx vitest run tests/db/costos.test.ts`
Expected: FAIL con `relation "v_costo_producto" does not exist`.

- [ ] **Step 3: Escribir la migración**

`supabase/migrations/20261005000003_vistas_costo.sql`:
```sql
-- Costo por unidad de rendimiento de cada sub-receta, resolviendo sub-recetas anidadas.
create view v_costo_subreceta with (security_invoker = true) as
with recursive expansion (raiz, insumo_id, subreceta_id, factor) as (
  select l.receta_id, l.insumo_id, l.subreceta_id, lc.cantidad / r.rendimiento
  from receta_lineas l
  join recetas r on r.id = l.receta_id and r.tipo = 'subreceta'
  join linea_cantidades lc on lc.linea_id = l.id
  union all
  select e.raiz, l.insumo_id, l.subreceta_id, e.factor * lc.cantidad / r.rendimiento
  from expansion e
  join receta_lineas l on l.receta_id = e.subreceta_id
  join recetas r on r.id = l.receta_id
  join linea_cantidades lc on lc.linea_id = l.id
)
select
  r.id as subreceta_id,
  coalesce(sum(e.factor * i.costo_unitario), 0) as costo_unitario,
  coalesce(bool_or(not i.activo or not rs.activo), false) as usa_inactivo
from recetas r
left join expansion e on e.raiz = r.id
left join insumos i on i.id = e.insumo_id
left join recetas rs on rs.id = e.subreceta_id
where r.tipo = 'subreceta'
group by r.id;

-- Costo de cada producto en cada tamaño que vende.
create view v_costo_producto with (security_invoker = true) as
select
  pt.producto_id,
  pt.tamano_id,
  coalesce(sum(lc.cantidad * coalesce(i.costo_unitario, cs.costo_unitario)), 0) as costo,
  coalesce(bool_or(not coalesce(i.activo, rs.activo) or coalesce(cs.usa_inactivo, false)), false) as usa_inactivo
from producto_tamanos pt
left join receta_lineas l on l.receta_id = pt.producto_id
left join linea_cantidades lc on lc.linea_id = l.id and lc.tamano_id = pt.tamano_id
left join insumos i on i.id = l.insumo_id and lc.linea_id is not null
left join recetas rs on rs.id = l.subreceta_id and lc.linea_id is not null
left join v_costo_subreceta cs on cs.subreceta_id = l.subreceta_id and lc.linea_id is not null
group by pt.producto_id, pt.tamano_id;
```

- [ ] **Step 4: Correr las pruebas**

Run: `npx vitest run tests/db`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): vistas de costo con sub-recetas recursivas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Vistas de resumen por canal y alertas

**Files:**
- Create: `supabase/migrations/20261005000004_vistas_resumen.sql`
- Test: `tests/db/resumen.test.ts`

**Interfaces:**
- Consumes: `v_costo_producto`, `parametros`, `canales`.
- Produces: vista `v_resumen` con columnas `producto_id, producto, activo, categoria_id, categoria, tamano_id, tamano, tamano_orden, canal_id, canal, canal_orden, regla_precio, comision_pct, comision_confirmada, costo_envase, markup_max_pct, precio_lista, costo, usa_inactivo, iva, margen_objetivo, precio_canal, venta_neta, food_cost, margen, margen_pct, markup` (una fila por producto × tamaño × canal). Vista `v_alerta_producto_canal(producto_id, producto, categoria, canal_id, canal, canal_orden, alerta)` con `alerta` ∈ los 6 textos de Global Constraints o `null`.

- [ ] **Step 1: Escribir la prueba**

`tests/db/resumen.test.ts`:
```ts
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { agregarLinea, crearInsumo, crearProducto } from './fabricas';
import { num } from './utilidades';

let db: PGlite;
let n = 0;

/** Producto de un solo tamaño cuyo costo es exactamente `costo` (insumo de costo unitario 1). */
async function productoCon(precio: number | null, costo: number): Promise<string> {
  n += 1;
  const insumo = await crearInsumo(db, { nombre: `INSUMO ${n}`, costoPaquete: 1, presentacion: 1, unidad: 'pza' });
  const p = await crearProducto(db, { nombre: `Producto ${n}`, precios: { Único: precio } });
  await agregarLinea(db, p, { insumoId: insumo, cantidades: { Único: costo } });
  return p;
}
const fila = async (p: string, canal: string) =>
  (await db.query<Record<string, string | null>>('select * from v_resumen where producto_id = $1 and canal = $2', [p, canal])).rows[0];
const alerta = async (p: string, canal: string) =>
  (await db.query<{ alerta: string | null }>('select alerta from v_alerta_producto_canal where producto_id = $1 and canal = $2', [p, canal])).rows[0].alerta;

beforeAll(async () => { db = await crearDbLocal(); });

describe('v_resumen (mismas fórmulas que el Excel)', () => {
  it('mostrador: venta neta sin IVA, food cost y margen', async () => {
    const p = await productoCon(65, 20);
    const f = await fila(p, 'Mostrador');
    expect(num(f.precio_canal)).toBe(65);
    expect(num(f.venta_neta)).toBeCloseTo(56.034483, 5);
    expect(num(f.food_cost)).toBeCloseTo(0.356923, 5);
    expect(num(f.margen)).toBeCloseTo(36.034483, 5);
    expect(num(f.margen_pct)).toBeCloseTo(0.643077, 5);
    expect(num(f.markup)).toBe(0);
  });

  it('Rappi: precio castigado con tope 25%, comisión sobre venta neta y envase', async () => {
    const p = await productoCon(65, 20);
    const f = await fila(p, 'Rappi');
    // neutro = ROUND(65/0.82 + 6.14·1.16/0.82) = 88; tope = ROUNDDOWN(81.25) = 81
    expect(num(f.precio_canal)).toBe(81);
    expect(num(f.markup)).toBeCloseTo(0.246154, 5);
    expect(num(f.margen)).toBeCloseTo(31.118621, 5);
    expect(num(f.margen_pct)).toBeCloseTo(0.44565, 5);
  });

  it('App propia: precio de mostrador, envase como costo y comisión configurable', async () => {
    const p = await productoCon(65, 20);
    expect(num((await fila(p, 'App propia')).margen)).toBeCloseTo(29.894483, 5);
    await db.query(`update canales set comision_pct = 0.035 where nombre = 'App propia'`);
    expect(num((await fila(p, 'App propia')).margen)).toBeCloseTo(29.894483 - 56.034483 * 0.035, 5);
    await db.query(`update canales set comision_pct = 0 where nombre = 'App propia'`);
  });

  it('cambiar el IVA recalcula todo al instante', async () => {
    const p = await productoCon(65, 20);
    await db.query('update parametros set iva = 0.08');
    expect(num((await fila(p, 'Mostrador')).venta_neta)).toBeCloseTo(65 / 1.08, 5);
    await db.query('update parametros set iva = 0.16');
    expect(num((await fila(p, 'Mostrador')).venta_neta)).toBeCloseTo(65 / 1.16, 5);
  });

  it('sin precio de lista los cálculos quedan en null', async () => {
    const p = await productoCon(null, 20);
    const f = await fila(p, 'Rappi');
    expect([f.precio_canal, f.venta_neta, f.margen, f.margen_pct, f.markup]).toEqual([null, null, null, null, null]);
  });
});

describe('v_alerta_producto_canal', () => {
  it('sin alerta cuando todo está sano', async () => {
    const p = await productoCon(65, 20);
    expect(await alerta(p, 'Mostrador')).toBeNull();
    expect(await alerta(p, 'Rappi')).toBeNull();
  });
  it('Falta precio de lista', async () => {
    expect(await alerta(await productoCon(null, 20), 'Rappi')).toBe('Falta precio de lista');
  });
  it('Vende por debajo del costo', async () => {
    expect(await alerta(await productoCon(65, 60), 'Mostrador')).toBe('Vende por debajo del costo');
  });
  it('Pierde dinero en el canal solo en los canales donde pierde', async () => {
    const p = await productoCon(65, 52);
    expect(await alerta(p, 'Rappi')).toBe('Pierde dinero en el canal');
    expect(await alerta(p, 'App propia')).toBe('Pierde dinero en el canal');
    expect(await alerta(p, 'Mostrador')).toBe('Margen bajo el objetivo');
  });
  it('Margen bajo el objetivo', async () => {
    expect(await alerta(await productoCon(65, 30), 'Mostrador')).toBe('Margen bajo el objetivo');
  });
  it('Usa insumo inactivo', async () => {
    const p = await productoCon(65, 20);
    await db.query(`update insumos set activo = false where nombre = $1`, [`INSUMO ${n}`]);
    expect(await alerta(p, 'Mostrador')).toBe('Usa insumo inactivo');
  });
});
```

- [ ] **Step 2: Correr la prueba para verificar que falla**

Run: `npx vitest run tests/db/resumen.test.ts`
Expected: FAIL con `relation "v_resumen" does not exist`.

- [ ] **Step 3: Escribir la migración**

`supabase/migrations/20261005000004_vistas_resumen.sql`:
```sql
-- Una fila por producto × tamaño × canal. Replica las fórmulas de la hoja Resumen del Excel.
create view v_resumen with (security_invoker = true) as
with base as (
  select
    r.id as producto_id, r.nombre as producto, r.activo,
    cp.id as categoria_id, cp.nombre as categoria,
    t.id as tamano_id, t.nombre as tamano, t.orden as tamano_orden,
    c.id as canal_id, c.nombre as canal, c.orden as canal_orden, c.regla_precio,
    c.comision_pct, c.comision_confirmada, c.costo_envase, c.markup_max_pct,
    nullif(pt.precio_lista, 0) as precio_lista,
    cpr.costo, cpr.usa_inactivo,
    par.iva, par.margen_objetivo
  from producto_tamanos pt
  join recetas r on r.id = pt.producto_id
  join categorias_producto cp on cp.id = r.categoria_id
  join tamanos t on t.id = pt.tamano_id
  join v_costo_producto cpr on cpr.producto_id = pt.producto_id and cpr.tamano_id = pt.tamano_id
  cross join canales c
  cross join parametros par
),
con_precio as (
  select b.*,
    case
      when b.precio_lista is null then null
      when b.regla_precio = 'mostrador' then b.precio_lista
      else least(
        round(b.precio_lista / (1 - b.comision_pct) + b.costo_envase * (1 + b.iva) / (1 - b.comision_pct), 0),
        case when b.markup_max_pct is null then null else floor(b.precio_lista * (1 + b.markup_max_pct)) end
      )
    end as precio_canal
  from base b
),
con_venta as (
  select p.*, p.precio_canal / (1 + p.iva) as venta_neta from con_precio p
)
select v.*,
  v.costo / v.venta_neta as food_cost,
  v.venta_neta - v.venta_neta * v.comision_pct - v.costo - v.costo_envase as margen,
  (v.venta_neta - v.venta_neta * v.comision_pct - v.costo - v.costo_envase) / v.venta_neta as margen_pct,
  v.precio_canal / v.precio_lista - 1 as markup
from con_venta v;

-- Una alerta por producto y canal, en el mismo orden de prioridad que el Excel.
-- Reglas 1, 2, 5 y 6 con números de mostrador (precio de lista); 3 y 4 con los del canal.
create view v_alerta_producto_canal with (security_invoker = true) as
select
  producto_id, producto, categoria, canal_id, canal, canal_orden,
  case
    when bool_and(precio_lista is null) then 'Falta precio de lista'
    when bool_or(precio_lista is not null and costo > precio_lista / (1 + iva)) then 'Vende por debajo del costo'
    when bool_or(markup_max_pct is not null and markup > markup_max_pct + 0.001) then 'Markup sobre el tope'
    when bool_or(margen < 0) then 'Pierde dinero en el canal'
    when bool_or(precio_lista is not null
                 and 1 - costo / (precio_lista / (1 + iva)) > 0
                 and 1 - costo / (precio_lista / (1 + iva)) < margen_objetivo) then 'Margen bajo el objetivo'
    when bool_or(usa_inactivo) then 'Usa insumo inactivo'
  end as alerta
from v_resumen
group by producto_id, producto, categoria, canal_id, canal, canal_orden;
```

- [ ] **Step 4: Correr las pruebas**

Run: `npx vitest run tests/db`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): resumen por canal y alertas con fórmulas del Excel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Perfiles, roles y bitácora automática

**Files:**
- Create: `supabase/migrations/20261005000005_perfiles_bitacora.sql`
- Modify: `tests/db/utilidades.ts` (agregar `crearUsuario`)
- Test: `tests/db/bitacora.test.ts`

**Interfaces:**
- Consumes: todas las tablas de negocio.
- Produces: tabla `perfiles(user_id, nombre, rol, activo)`; funciones `rol_actual(): text`, `tiene_rol(variadic text[]): boolean`; tabla `bitacora(id, tabla, registro_id, receta_id, campo, valor_anterior, valor_nuevo, nota, usuario_id, fecha, origen)`; trigger `registrar_bitacora()` en todas las tablas de negocio. Convención: `set_config('app.origen', 'migracion'|'carga_masiva', true)` dentro de una transacción cambia el origen; con `'migracion'` el trigger no registra (la migración inserta su propio historial). `crearUsuario(db, rol): Promise<string>`.

- [ ] **Step 1: Agregar `crearUsuario` a las utilidades**

`tests/db/utilidades.ts` completo:
```ts
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';

export const num = (v: unknown): number => Number(v);

export type Rol = 'compras' | 'operaciones' | 'finanzas' | 'admin';

/** Ejecuta fn como el rol `authenticated` de Supabase con auth.uid() = userId. */
export async function comoUsuario<T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
  await db.exec('set role authenticated');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}

/** Crea un usuario de auth con su perfil (como superusuario). */
export async function crearUsuario(db: PGlite, rol: Rol): Promise<string> {
  const id = randomUUID();
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${rol}-${id}@prueba.mx`]);
  await db.query('insert into perfiles (user_id, nombre, rol) values ($1, $2, $3)', [id, `Usuario ${rol}`, rol]);
  return id;
}
```

- [ ] **Step 2: Escribir la prueba**

`tests/db/bitacora.test.ts`:
```ts
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { agregarLinea, crearInsumo, crearProducto, idTamano } from './fabricas';
import { crearUsuario } from './utilidades';

let db: PGlite;
beforeAll(async () => { db = await crearDbLocal(); });

type Fila = { tabla: string; registro_id: string; receta_id: string | null; campo: string; valor_anterior: string | null; valor_nuevo: string | null; usuario_id: string | null; origen: string };
const bitacoraDe = async (registroId: string) =>
  (await db.query<Fila>('select * from bitacora where registro_id = $1 order by id', [registroId])).rows;

describe('bitácora', () => {
  it('registra cada campo cambiado con valor anterior, nuevo y usuario', async () => {
    const usuario = await crearUsuario(db, 'compras');
    const insumo = await crearInsumo(db, { nombre: 'CAFE BITACORA', costoPaquete: 400, presentacion: 1000 });
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [usuario]);
    await db.query('update insumos set costo_paquete = 450, presentacion = 1000 where id = $1', [insumo]);
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
    const filas = (await bitacoraDe(insumo)).filter((f) => f.campo !== '*');
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ tabla: 'insumos', campo: 'costo_paquete', valor_anterior: '400', valor_nuevo: '450', usuario_id: usuario, origen: 'portal' });
  });

  it('registra altas y bajas como un solo renglón con el registro completo', async () => {
    const insumo = await crearInsumo(db, { nombre: 'ALTA BITACORA', costoPaquete: 1, presentacion: 1 });
    const alta = await bitacoraDe(insumo);
    expect(alta).toHaveLength(1);
    expect(alta[0].campo).toBe('*');
    expect(alta[0].valor_nuevo).toContain('ALTA BITACORA');
  });

  it('liga los cambios de cantidades a su receta', async () => {
    const insumo = await crearInsumo(db, { nombre: 'CAFE RECETA', costoPaquete: 400, presentacion: 1000 });
    const p = await crearProducto(db, { nombre: 'Producto bitácora', precios: { Único: 50 } });
    const linea = await agregarLinea(db, p, { insumoId: insumo, cantidades: { Único: 18 } });
    const tamano = await idTamano(db, 'Único');
    await db.query('update linea_cantidades set cantidad = 20 where linea_id = $1', [linea]);
    const filas = await bitacoraDe(`${linea}:${tamano}`);
    const cambio = filas.find((f) => f.campo === 'cantidad');
    expect(cambio).toMatchObject({ tabla: 'linea_cantidades', receta_id: p, valor_anterior: '18', valor_nuevo: '20' });
  });

  it('no registra nada con origen migracion y respeta carga_masiva', async () => {
    const insumo = await crearInsumo(db, { nombre: 'ORIGEN', costoPaquete: 1, presentacion: 1 });
    await db.exec(`begin; select set_config('app.origen', 'migracion', true); update insumos set costo_paquete = 2 where nombre = 'ORIGEN'; commit;`);
    expect((await bitacoraDe(insumo)).filter((f) => f.campo === 'costo_paquete')).toHaveLength(0);
    await db.exec(`begin; select set_config('app.origen', 'carga_masiva', true); update insumos set costo_paquete = 3 where nombre = 'ORIGEN'; commit;`);
    const filas = (await bitacoraDe(insumo)).filter((f) => f.campo === 'costo_paquete');
    expect(filas.map((f) => f.origen)).toEqual(['carga_masiva']);
  });

  it('ignora columnas técnicas (updated_at, version, costo_unitario)', async () => {
    const insumo = await crearInsumo(db, { nombre: 'TECNICO', costoPaquete: 1, presentacion: 1 });
    await db.query('update insumos set costo_paquete = 5 where id = $1', [insumo]);
    const campos = (await bitacoraDe(insumo)).map((f) => f.campo);
    expect(campos).not.toContain('updated_at');
    expect(campos).not.toContain('costo_unitario');
  });

  it('rol_actual y tiene_rol leen el perfil del usuario en sesión', async () => {
    const usuario = await crearUsuario(db, 'finanzas');
    await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [usuario]);
    const r = await db.query<{ rol: string; si: boolean; no: boolean }>(
      `select rol_actual() as rol, tiene_rol('finanzas', 'admin') as si, tiene_rol('compras') as no`,
    );
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
    expect(r.rows[0]).toEqual({ rol: 'finanzas', si: true, no: false });
  });
});
```

- [ ] **Step 3: Correr la prueba para verificar que falla**

Run: `npx vitest run tests/db/bitacora.test.ts`
Expected: FAIL con `relation "perfiles" does not exist`.

- [ ] **Step 4: Escribir la migración**

`supabase/migrations/20261005000005_perfiles_bitacora.sql`:
```sql
create table perfiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nombre text not null check (btrim(nombre) <> ''),
  rol text not null check (rol in ('compras', 'operaciones', 'finanzas', 'admin')),
  activo boolean not null default true
);

create function rol_actual() returns text
language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where user_id = auth.uid() and activo
$$;

create function tiene_rol(variadic roles text[]) returns boolean
language sql stable as $$
  select coalesce(public.rol_actual() = any(roles), false)
$$;

create table bitacora (
  id bigint generated always as identity primary key,
  tabla text not null,
  registro_id text,
  receta_id uuid,
  campo text,
  valor_anterior text,
  valor_nuevo text,
  nota text,
  usuario_id uuid,
  fecha timestamptz not null default now(),
  origen text not null default 'portal' check (origen in ('portal', 'carga_masiva', 'migracion'))
);
create index bitacora_registro on bitacora (registro_id);
create index bitacora_receta on bitacora (receta_id);
create index bitacora_fecha on bitacora (fecha desc);

create function registrar_bitacora() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_origen text := coalesce(nullif(current_setting('app.origen', true), ''), 'portal');
  v_viejo jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_nuevo jsonb := case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) end;
  v_fila jsonb := coalesce(v_nuevo, v_viejo);
  v_registro text;
  v_receta uuid;
  v_campo text;
begin
  if v_origen = 'migracion' then
    return null;
  end if;
  v_registro := coalesce(v_fila ->> 'id', v_fila ->> 'user_id',
                         concat_ws(':', v_fila ->> 'producto_id', v_fila ->> 'linea_id', v_fila ->> 'tamano_id'));
  v_receta := case tg_table_name
    when 'recetas' then (v_fila ->> 'id')::uuid
    when 'producto_tamanos' then (v_fila ->> 'producto_id')::uuid
    when 'receta_lineas' then (v_fila ->> 'receta_id')::uuid
    when 'linea_cantidades' then (select receta_id from receta_lineas where id = (v_fila ->> 'linea_id')::uuid)
  end;
  if tg_op = 'UPDATE' then
    for v_campo in select jsonb_object_keys(v_nuevo) loop
      continue when v_campo = any (array['updated_at', 'updated_by', 'version', 'costo_unitario']);
      if (v_viejo -> v_campo) is distinct from (v_nuevo -> v_campo) then
        insert into bitacora (tabla, registro_id, receta_id, campo, valor_anterior, valor_nuevo, usuario_id, origen)
        values (tg_table_name, v_registro, v_receta, v_campo, v_viejo ->> v_campo, v_nuevo ->> v_campo, auth.uid(), v_origen);
      end if;
    end loop;
  else
    insert into bitacora (tabla, registro_id, receta_id, campo, valor_anterior, valor_nuevo, usuario_id, origen)
    values (tg_table_name, v_registro, v_receta, '*', v_viejo::text, v_nuevo::text, auth.uid(), v_origen);
  end if;
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['parametros', 'canales', 'tamanos', 'proveedores', 'categorias_insumo', 'categorias_producto',
                           'insumos', 'recetas', 'producto_tamanos', 'receta_lineas', 'linea_cantidades', 'perfiles'] loop
    execute format('create trigger %I after insert or update or delete on %I for each row execute function registrar_bitacora()',
                   t || '_bitacora', t);
  end loop;
end $$;
```

- [ ] **Step 5: Correr las pruebas**

Run: `npx vitest run tests/db`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): perfiles con rol y bitácora automática por triggers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Permisos por rol (RLS)

**Files:**
- Create: `supabase/migrations/20261005000006_permisos.sql`
- Test: `tests/db/permisos.test.ts`

**Interfaces:**
- Consumes: `tiene_rol`, todas las tablas y vistas.
- Produces: RLS activado en todas las tablas; lectura para todo `authenticated`; escritura según la matriz del spec §6; `anon` sin acceso; trigger `vigilar_producto_tamanos()` que separa precio (Finanzas) de tamaños (Operaciones). **Toda tabla nueva en planes futuros debe agregar su RLS y grants.**

- [ ] **Step 1: Escribir la prueba**

`tests/db/permisos.test.ts`:
```ts
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { agregarLinea, crearInsumo, crearProducto, idTamano } from './fabricas';
import { comoUsuario, crearUsuario, num } from './utilidades';

let db: PGlite;
let compras: string, operaciones: string, finanzas: string, admin: string, sinPerfil: string;
let insumo: string, producto: string, chica: string, grande: string;

beforeAll(async () => {
  db = await crearDbLocal();
  [compras, operaciones, finanzas, admin] = [
    await crearUsuario(db, 'compras'), await crearUsuario(db, 'operaciones'),
    await crearUsuario(db, 'finanzas'), await crearUsuario(db, 'admin'),
  ];
  sinPerfil = '00000000-0000-0000-0000-0000000000ff';
  await db.query('insert into auth.users (id) values ($1)', [sinPerfil]);
  insumo = await crearInsumo(db, { nombre: 'CAFE PERMISOS', costoPaquete: 400, presentacion: 1000 });
  producto = await crearProducto(db, { nombre: 'Latte permisos', precios: { Chica: 65 } });
  chica = await idTamano(db, 'Chica');
  grande = await idTamano(db, 'Grande');
});

const cambiarCosto = (uid: string) =>
  comoUsuario(db, uid, () => db.query('update insumos set costo_paquete = costo_paquete + 1 where id = $1 returning id', [insumo]));

describe('permisos', () => {
  it('todos los usuarios con sesión pueden leer tablas y vistas', async () => {
    for (const uid of [compras, operaciones, finanzas, sinPerfil]) {
      const r = await comoUsuario(db, uid, () => db.query('select count(*)::int as n from v_resumen'));
      expect(num((r.rows[0] as { n: number }).n)).toBeGreaterThan(0);
    }
  });

  it('anon no puede leer nada', async () => {
    await db.exec('set role anon');
    try {
      await expect(db.query('select * from insumos')).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec('reset role');
    }
  });

  it('solo Compras y Admin editan insumos', async () => {
    expect((await cambiarCosto(compras)).rows).toHaveLength(1);
    expect((await cambiarCosto(admin)).rows).toHaveLength(1);
    expect((await cambiarCosto(operaciones)).rows).toHaveLength(0);
    expect((await cambiarCosto(finanzas)).rows).toHaveLength(0);
    expect((await cambiarCosto(sinPerfil)).rows).toHaveLength(0);
  });

  it('nadie borra insumos (se desactivan)', async () => {
    await expect(comoUsuario(db, admin, () => db.query('delete from insumos where id = $1', [insumo]))).rejects.toThrow(/permission denied/);
  });

  it('solo Operaciones y Admin arman recetas', async () => {
    await expect(comoUsuario(db, compras, () => agregarLinea(db, producto, { insumoId: insumo, cantidades: { Chica: 1 } }))).rejects.toThrow();
    const linea = await comoUsuario(db, operaciones, () => agregarLinea(db, producto, { insumoId: insumo, cantidades: { Chica: 18 } }));
    expect(linea).toBeTruthy();
  });

  it('solo Finanzas y Admin capturan precios de lista', async () => {
    const cambiar = (uid: string, precio: number) => comoUsuario(db, uid, () =>
      db.query('update producto_tamanos set precio_lista = $3 where producto_id = $1 and tamano_id = $2 returning precio_lista', [producto, chica, precio]));
    await expect(cambiar(operaciones, 70)).rejects.toThrow(/Solo Finanzas/);
    expect((await cambiar(compras, 70)).rows).toHaveLength(0);
    expect((await cambiar(finanzas, 70)).rows).toHaveLength(1);
  });

  it('Operaciones agrega tamaños sin precio; con precio solo Finanzas', async () => {
    const alta = (uid: string, precio: number | null) => comoUsuario(db, uid, () =>
      db.query('insert into producto_tamanos (producto_id, tamano_id, precio_lista) values ($1, $2, $3)', [producto, grande, precio]));
    await expect(alta(operaciones, 80)).rejects.toThrow(/Solo Finanzas/);
    await expect(alta(finanzas, null)).rejects.toThrow();
    await alta(operaciones, null);
  });

  it('solo Finanzas y Admin cambian parámetros y canales', async () => {
    const iva = (uid: string) => comoUsuario(db, uid, () => db.query('update parametros set iva = 0.16 returning id'));
    expect((await iva(operaciones)).rows).toHaveLength(0);
    expect((await iva(finanzas)).rows).toHaveLength(1);
    const canal = (uid: string) => comoUsuario(db, uid, () => db.query(`update canales set comision_pct = 0.03 where nombre = 'App propia' returning id`));
    expect((await canal(compras)).rows).toHaveLength(0);
    expect((await canal(admin)).rows).toHaveLength(1);
  });

  it('solo Admin gestiona perfiles y nadie escribe en la bitácora', async () => {
    const cambiarRol = (uid: string) => comoUsuario(db, uid, () =>
      db.query(`update perfiles set rol = 'admin' where user_id = $1 returning user_id`, [compras]));
    expect((await cambiarRol(compras)).rows).toHaveLength(0);
    await expect(comoUsuario(db, admin, () => db.query(`insert into bitacora (tabla) values ('x')`))).rejects.toThrow(/permission denied/);
  });

  it('la bitácora registra al usuario que hizo el cambio bajo RLS', async () => {
    await cambiarCosto(compras);
    const r = await db.query<{ usuario_id: string }>(
      `select usuario_id from bitacora where registro_id = $1 and campo = 'costo_paquete' order by id desc limit 1`, [insumo]);
    expect(r.rows[0].usuario_id).toBe(compras);
  });
});
```

- [ ] **Step 2: Correr la prueba para verificar que falla**

Run: `npx vitest run tests/db/permisos.test.ts`
Expected: FAIL (p. ej. "anon no puede leer nada" no lanza error y Operaciones sí logra editar insumos).

- [ ] **Step 3: Escribir la migración**

`supabase/migrations/20261005000006_permisos.sql`:
```sql
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update on parametros, canales, tamanos, proveedores, categorias_insumo, categorias_producto,
  insumos, recetas, producto_tamanos, receta_lineas, linea_cantidades, perfiles to authenticated;
grant delete on producto_tamanos, receta_lineas, linea_cantidades to authenticated;

do $$
declare t text;
begin
  foreach t in array array['parametros', 'canales', 'tamanos', 'proveedores', 'categorias_insumo', 'categorias_producto',
                           'insumos', 'recetas', 'producto_tamanos', 'receta_lineas', 'linea_cantidades', 'perfiles', 'bitacora'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy lectura on %I for select to authenticated using (true)', t);
  end loop;
end $$;

create function crear_politicas_escritura(tabla text, roles text[], con_borrado boolean) returns void
language plpgsql as $$
declare
  condicion text := format('public.tiene_rol(variadic %L::text[])', roles);
begin
  execute format('create policy alta on %I for insert to authenticated with check (%s)', tabla, condicion);
  execute format('create policy cambio on %I for update to authenticated using (%s) with check (%s)', tabla, condicion, condicion);
  if con_borrado then
    execute format('create policy baja on %I for delete to authenticated using (%s)', tabla, condicion);
  end if;
end $$;

select crear_politicas_escritura('proveedores', array['compras', 'admin'], false);
select crear_politicas_escritura('categorias_insumo', array['compras', 'admin'], false);
select crear_politicas_escritura('insumos', array['compras', 'admin'], false);
select crear_politicas_escritura('categorias_producto', array['operaciones', 'admin'], false);
select crear_politicas_escritura('recetas', array['operaciones', 'admin'], false);
select crear_politicas_escritura('receta_lineas', array['operaciones', 'admin'], true);
select crear_politicas_escritura('linea_cantidades', array['operaciones', 'admin'], true);
select crear_politicas_escritura('parametros', array['finanzas', 'admin'], false);
select crear_politicas_escritura('canales', array['finanzas', 'admin'], false);
select crear_politicas_escritura('tamanos', array['finanzas', 'admin'], false);
select crear_politicas_escritura('perfiles', array['admin'], false);
drop function crear_politicas_escritura(text, text[], boolean);

-- producto_tamanos: Operaciones decide qué tamaños vende un producto; Finanzas captura el precio.
create policy alta on producto_tamanos for insert to authenticated with check (tiene_rol('operaciones', 'admin'));
create policy baja on producto_tamanos for delete to authenticated using (tiene_rol('operaciones', 'admin'));
create policy cambio on producto_tamanos for update to authenticated
  using (tiene_rol('operaciones', 'finanzas', 'admin')) with check (tiene_rol('operaciones', 'finanzas', 'admin'));

create function vigilar_producto_tamanos() returns trigger language plpgsql as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.precio_lista is not null and not tiene_rol('finanzas', 'admin') then
      raise exception 'Solo Finanzas puede capturar precios de lista';
    end if;
  else
    if new.precio_lista is distinct from old.precio_lista and not tiene_rol('finanzas', 'admin') then
      raise exception 'Solo Finanzas puede capturar precios de lista';
    end if;
    if (new.producto_id, new.tamano_id) is distinct from (old.producto_id, old.tamano_id) and not tiene_rol('operaciones', 'admin') then
      raise exception 'Solo Operaciones puede cambiar los tamaños de un producto';
    end if;
  end if;
  return new;
end $$;
create trigger producto_tamanos_vigilar before insert or update on producto_tamanos
  for each row execute function vigilar_producto_tamanos();
```

Nota: la prueba "Operaciones agrega tamaños sin precio" espera que Finanzas **no** pueda insertar (falla por RLS de `alta`); con `precio_lista = null` el trigger no interviene y la política lo rechaza.

- [ ] **Step 4: Correr todas las pruebas de base de datos**

Run: `npx vitest run tests/db`
Expected: PASS (incluidas las de tasks previas: corren como superusuario y no se ven afectadas por RLS).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(db): permisos por rol con RLS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Lectura del Excel

**Files:**
- Create: `scripts/migracion/tipos.ts`, `scripts/migracion/leer-excel.ts`, `tests/migracion/fixture-libro.ts`
- Test: `tests/migracion/leer-excel.test.ts`

**Interfaces:**
- Produces (`tipos.ts`):
```ts
export type Tamano = 'Único' | 'Chica' | 'Grande';
export interface ParametrosExcel { iva: number; comisionRappi: number; envaseRappi: number; markupMaxRappi: number; margenObjetivo: number }
export interface InsumoExcel { fila: number; nombre: string; proveedor: string | null; categoria: string | null; costoPaquete: number; presentacion: number; unidad: string | null }
export interface LineaExcel { fila: number; producto: string; clasificacion: string | null; insumo: string; cantChica: number; cantGrande: number }
export interface ProductoExcel { fila: number; categoria: string; nombre: string; costoChica: number; costoGrande: number; precioChica: number; precioGrande: number; precioRappi: number; margenRappi: number; alerta: string }
export interface CambioExcel { hoja: 'Auditoria' | 'Correcciones'; seccion: string; campo: string; anterior: string | null; nuevo: string | null; nota: string | null }
export interface LibroExcel { parametros: ParametrosExcel; insumos: InsumoExcel[]; lineas: LineaExcel[]; productos: ProductoExcel[]; cambios: CambioExcel[] }
```
- Produces (`leer-excel.ts`): `leerLibro(ruta: string): LibroExcel`; `texto(v: unknown): string | null` (trim + colapsa espacios); `numero(v: unknown): number` (vacío → 0).
- Produces (fixture): `escribirLibroFixture(d?: DatosFixture): string` (ruta a un .xlsx temporal); `filaResumen(o: { categoria, nombre, costoChica, costoGrande?, precioChica?, precioGrande?, precioRappi?, margenRappi?, alerta? }): unknown[]`.

- [ ] **Step 1: Escribir los tipos**

`scripts/migracion/tipos.ts`: el bloque de interfaces de arriba, exactamente.

- [ ] **Step 2: Escribir el fixture**

`tests/migracion/fixture-libro.ts`:
```ts
import * as XLSX from 'xlsx';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface DatosFixture {
  insumos?: unknown[][];
  recetario?: unknown[][];
  resumen?: unknown[][];
  auditoria?: unknown[][];
  correcciones?: unknown[][];
}

/** Hoja con título en la fila 1, encabezado en la fila 4 y datos desde la fila 5 (como el Excel real). */
function hojaConDatos(titulo: string, datos: unknown[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet([[titulo], [], [], ['encabezado'], ...datos]);
}

export function filaResumen(o: {
  categoria: string; nombre: string; costoChica: number; costoGrande?: number; precioChica?: number;
  precioGrande?: number; precioRappi?: number; margenRappi?: number; alerta?: string;
}): unknown[] {
  const fila: unknown[] = new Array(21).fill(null);
  fila[0] = o.categoria; fila[1] = o.nombre; fila[2] = o.costoChica; fila[3] = o.costoGrande ?? 0;
  fila[4] = o.precioChica ?? 0; fila[5] = o.precioGrande ?? 0;
  fila[16] = o.precioRappi ?? 0; fila[18] = o.margenRappi ?? 0; fila[20] = o.alerta ?? '';
  return fila;
}

export function escribirLibroFixture(d: DatosFixture = {}): string {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['PARÁMETROS DEL MODELO'], [], [], ['1 · REGLAS'], [null, 'Parámetro', 'Valor'],
    [1, 'IVA', 0.16], [2, 'Comisión Rappi', 0.18], [3, 'Envase de envío Rappi', 6.14],
    [4, 'Markup máximo Rappi vs POS', 0.25], [5, 'Margen bruto objetivo', 0.55],
  ]), 'Parametros');
  XLSX.utils.book_append_sheet(wb, hojaConDatos('RESUMEN', d.resumen ?? []), 'Resumen');
  XLSX.utils.book_append_sheet(wb, hojaConDatos('INSUMOS', d.insumos ?? []), 'Insumos');
  XLSX.utils.book_append_sheet(wb, hojaConDatos('RECETARIO', d.recetario ?? []), 'Recetario');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['AUDITORÍA'], [], [], ...(d.auditoria ?? [])]), 'Auditoria');
  XLSX.utils.book_append_sheet(wb, hojaConDatos('CORRECCIONES', d.correcciones ?? []), 'Correcciones');
  const ruta = join(mkdtempSync(join(tmpdir(), 'costeo-')), 'libro.xlsx');
  writeFileSync(ruta, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  return ruta;
}
```

- [ ] **Step 3: Escribir la prueba**

`tests/migracion/leer-excel.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { leerLibro, numero, texto } from '../../scripts/migracion/leer-excel';
import { escribirLibroFixture, filaResumen } from './fixture-libro';

describe('texto y numero', () => {
  it('limpian espacios y vacíos', () => {
    expect(texto('  CAFÉ   TOSTADO ')).toBe('CAFÉ TOSTADO');
    expect(texto('   ')).toBeNull();
    expect(texto(null)).toBeNull();
    expect(texto(12.5)).toBe('12.5');
    expect(numero(null)).toBe(0);
    expect(numero('3.5')).toBe(3.5);
    expect(numero('abc')).toBe(0);
  });
});

describe('leerLibro', () => {
  const ruta = escribirLibroFixture({
    insumos: [
      ['CAFE', 'CEDIS', 'CAFÉ', 400, 1000, 'gr', 0.4, 1],
      [null, null, null, null, null, null],
      ['CREMA  CHOBANI', null, null, 90, 900, 'ml'],
    ],
    recetario: [
      ['BEBIDA FRÍA', 'Latte', 'CAFÉ', 'CAFE', 18, 20],
      [null, 'Latte', null, 'agua', 100, null],
    ],
    resumen: [filaResumen({ categoria: 'BEBIDA FRÍA', nombre: 'Latte', costoChica: 7.2, costoGrande: 8, precioChica: 65, precioRappi: 81, margenRappi: 31.1, alerta: 'Margen bajo el objetivo' })],
    auditoria: [
      ['1 · LÍNEAS ELIMINADAS'], ['Producto', 'Insumo', 'Acción'], ['Latte', 'AGUA', 'Se dejó una sola línea'],
      [], ['2 · NOMBRES UNIFICADOS'], ['Antes', 'Después'], ['Late', 'Latte'],
    ],
    correcciones: [['Latte', 'CH', 'CAFE', 16, 18, 0.8, 'gramaje ajustado', 'RECETARIO OFICIAL 2026']],
  });
  const libro = leerLibro(ruta);

  it('lee parámetros por etiqueta', () => {
    expect(libro.parametros).toEqual({ iva: 0.16, comisionRappi: 0.18, envaseRappi: 6.14, markupMaxRappi: 0.25, margenObjetivo: 0.55 });
  });

  it('lee insumos saltando filas vacías y conservando nulos', () => {
    expect(libro.insumos).toEqual([
      { fila: 5, nombre: 'CAFE', proveedor: 'CEDIS', categoria: 'CAFÉ', costoPaquete: 400, presentacion: 1000, unidad: 'gr' },
      { fila: 7, nombre: 'CREMA CHOBANI', proveedor: null, categoria: null, costoPaquete: 90, presentacion: 900, unidad: 'ml' },
    ]);
  });

  it('lee líneas del recetario con cantidades vacías en 0', () => {
    expect(libro.lineas).toEqual([
      { fila: 5, producto: 'Latte', clasificacion: 'CAFÉ', insumo: 'CAFE', cantChica: 18, cantGrande: 20 },
      { fila: 6, producto: 'Latte', clasificacion: null, insumo: 'agua', cantChica: 100, cantGrande: 0 },
    ]);
  });

  it('lee el resumen con costos, precios, Rappi y alerta', () => {
    expect(libro.productos).toEqual([{
      fila: 5, categoria: 'BEBIDA FRÍA', nombre: 'Latte', costoChica: 7.2, costoGrande: 8, precioChica: 65, precioGrande: 0,
      precioRappi: 81, margenRappi: 31.1, alerta: 'Margen bajo el objetivo',
    }]);
  });

  it('lee auditoría por secciones y correcciones con antes/después', () => {
    expect(libro.cambios).toEqual([
      { hoja: 'Auditoria', seccion: '1 · LÍNEAS ELIMINADAS', campo: 'Latte | AGUA | Se dejó una sola línea', anterior: null, nuevo: null, nota: '1 · LÍNEAS ELIMINADAS' },
      { hoja: 'Auditoria', seccion: '2 · NOMBRES UNIFICADOS', campo: 'Late | Latte', anterior: null, nuevo: null, nota: '2 · NOMBRES UNIFICADOS' },
      { hoja: 'Correcciones', seccion: 'Correcciones', campo: 'Latte · CH · CAFE', anterior: '16', nuevo: '18', nota: 'gramaje ajustado — RECETARIO OFICIAL 2026' },
    ]);
  });

  it('acepta un libro con todas las hojas pero sin datos', () => {
    const vacio = leerLibro(escribirLibroFixture());
    expect([vacio.insumos, vacio.lineas, vacio.productos, vacio.cambios]).toEqual([[], [], [], []]);
  });
});
```

- [ ] **Step 4: Correr la prueba para verificar que falla**

Run: `npx vitest run tests/migracion/leer-excel.test.ts`
Expected: FAIL con `Cannot find module '../../scripts/migracion/leer-excel'`.

- [ ] **Step 5: Implementar**

`scripts/migracion/leer-excel.ts`:
```ts
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import type { CambioExcel, InsumoExcel, LibroExcel, LineaExcel, ParametrosExcel, ProductoExcel } from './tipos';

type Fila = Record<string, unknown> & { __rowNum__: number };

export function texto(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim().replace(/\s+/g, ' ');
  return s === '' ? null : s;
}

export function numero(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : 0;
}

function hoja(libro: XLSX.WorkBook, nombre: string): XLSX.WorkSheet {
  const ws = libro.Sheets[nombre];
  if (!ws) throw new Error(`El Excel no tiene la hoja "${nombre}"`);
  return ws;
}

/** Filas desde `desdeFila` (1 = primera fila), con columnas por letra y valores en caché (no fórmulas). */
function filas(ws: XLSX.WorkSheet, desdeFila: number): Fila[] {
  return XLSX.utils.sheet_to_json<Fila>(ws, { header: 'A', range: desdeFila - 1, defval: null, raw: true, blankrows: false });
}

const numeroDeFila = (f: Fila) => f.__rowNum__ + 1;

const ETIQUETAS: Record<keyof ParametrosExcel, string> = {
  iva: 'IVA',
  comisionRappi: 'Comisión Rappi',
  envaseRappi: 'Envase de envío Rappi',
  markupMaxRappi: 'Markup máximo Rappi vs POS',
  margenObjetivo: 'Margen bruto objetivo',
};

function leerParametros(ws: XLSX.WorkSheet): ParametrosExcel {
  const porEtiqueta = new Map<string, number>();
  for (const f of filas(ws, 1)) {
    const etiqueta = texto(f.B);
    if (etiqueta) porEtiqueta.set(etiqueta, numero(f.C));
  }
  const resultado = {} as ParametrosExcel;
  for (const [clave, etiqueta] of Object.entries(ETIQUETAS) as [keyof ParametrosExcel, string][]) {
    const valor = porEtiqueta.get(etiqueta);
    if (valor === undefined) throw new Error(`Falta el parámetro "${etiqueta}" en la hoja Parametros`);
    resultado[clave] = valor;
  }
  return resultado;
}

function leerInsumos(ws: XLSX.WorkSheet): InsumoExcel[] {
  return filas(ws, 5)
    .filter((f) => texto(f.A))
    .map((f) => ({
      fila: numeroDeFila(f),
      nombre: texto(f.A)!,
      proveedor: texto(f.B),
      categoria: texto(f.C),
      costoPaquete: numero(f.D),
      presentacion: numero(f.E),
      unidad: texto(f.F),
    }));
}

function leerRecetario(ws: XLSX.WorkSheet): LineaExcel[] {
  return filas(ws, 5)
    .filter((f) => texto(f.B) && texto(f.D))
    .map((f) => ({
      fila: numeroDeFila(f),
      producto: texto(f.B)!,
      clasificacion: texto(f.C),
      insumo: texto(f.D)!,
      cantChica: numero(f.E),
      cantGrande: numero(f.F),
    }));
}

function leerResumen(ws: XLSX.WorkSheet): ProductoExcel[] {
  return filas(ws, 5)
    .filter((f) => texto(f.B))
    .map((f) => ({
      fila: numeroDeFila(f),
      categoria: texto(f.A) ?? '',
      nombre: texto(f.B)!,
      costoChica: numero(f.C),
      costoGrande: numero(f.D),
      precioChica: numero(f.E),
      precioGrande: numero(f.F),
      precioRappi: numero(f.Q),
      margenRappi: numero(f.S),
      alerta: texto(f.U) ?? '',
    }));
}

const letrasOrdenadas = (f: Fila) =>
  Object.keys(f)
    .filter((k) => k !== '__rowNum__')
    .sort((a, b) => a.length - b.length || a.localeCompare(b));

function leerAuditoria(ws: XLSX.WorkSheet): CambioExcel[] {
  const resultado: CambioExcel[] = [];
  let seccion: string | null = null;
  let saltarEncabezado = false;
  for (const f of filas(ws, 4)) {
    const a = texto(f.A);
    if (a && /^\d+\s*·/.test(a)) {
      seccion = a;
      saltarEncabezado = true;
      continue;
    }
    if (!seccion) continue;
    const celdas = letrasOrdenadas(f).map((k) => texto(f[k])).filter((c): c is string => c !== null);
    if (celdas.length === 0) continue;
    if (saltarEncabezado) {
      saltarEncabezado = false;
      continue;
    }
    resultado.push({ hoja: 'Auditoria', seccion, campo: celdas.join(' | '), anterior: null, nuevo: null, nota: seccion });
  }
  return resultado;
}

function leerCorrecciones(ws: XLSX.WorkSheet): CambioExcel[] {
  return filas(ws, 5)
    .filter((f) => texto(f.A))
    .map((f) => ({
      hoja: 'Correcciones' as const,
      seccion: 'Correcciones',
      campo: [f.A, f.B, f.C].map(texto).filter(Boolean).join(' · '),
      anterior: texto(f.D),
      nuevo: texto(f.E),
      nota: [texto(f.G), texto(f.H)].filter(Boolean).join(' — ') || null,
    }));
}

export function leerLibro(ruta: string): LibroExcel {
  const libro = XLSX.read(readFileSync(ruta), { cellFormula: false });
  return {
    parametros: leerParametros(hoja(libro, 'Parametros')),
    insumos: leerInsumos(hoja(libro, 'Insumos')),
    lineas: leerRecetario(hoja(libro, 'Recetario')),
    productos: leerResumen(hoja(libro, 'Resumen')),
    cambios: [...leerAuditoria(hoja(libro, 'Auditoria')), ...leerCorrecciones(hoja(libro, 'Correcciones'))],
  };
}
```

- [ ] **Step 6: Correr la prueba**

Run: `npx vitest run tests/migracion/leer-excel.test.ts`
Expected: PASS. Además, verificación rápida con el Excel real:

Run: `npx tsx -e "import {leerLibro} from './scripts/migracion/leer-excel'; const l=leerLibro('datos/Modelo_Costeo_Corregido_2026.xlsx'); console.log(l.insumos.length, l.lineas.length, l.productos.length, l.cambios.length, l.parametros)"`
Expected: `164 923 154 <n> { iva: 0.16, comisionRappi: 0.18, envaseRappi: 6.14, markupMaxRappi: 0.25, margenObjetivo: 0.55 }` (líneas puede ser 922–923 según la fila sin categoría; anotar el número real).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(migracion): lectura del Excel de costeo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Limpieza, unidades, tamaños y equivalencias de categorías

**Files:**
- Create: `scripts/migracion/equivalencias.ts`, `scripts/migracion/limpiar.ts`
- Test: `tests/migracion/limpiar.test.ts`

**Interfaces:**
- Consumes: tipos de Task 8.
- Produces:
```ts
// equivalencias.ts
export const EQUIVALENCIAS_CATEGORIA: Record<string, string>;
// limpiar.ts
export const POR_ASIGNAR = 'POR ASIGNAR';
export interface Aviso { tipo: string; detalle: string }
export type Unidad = 'gr' | 'ml' | 'pza';
export interface InsumoLimpio { nombre: string; proveedor: string; categoria: string; costoPaquete: number; presentacion: number; unidad: Unidad }
export function clave(s: string): string;                                  // trim + espacios + MAYÚSCULAS (equivale a MATCH de Excel)
export function normalizarUnidad(u: string | null): Unidad;               // lanza Error si no la reconoce
export function limpiarInsumos(insumos: InsumoExcel[], avisos: Aviso[]): InsumoLimpio[];
export function mapearCategoriaProducto(original: string): string;
export function tamanosDeProducto(lineas: LineaExcel[]): Tamano[];         // ['Chica','Grande'] si alguna línea tiene cantGrande > 0; si no ['Único']
export function cantidadesPorTamano(linea: LineaExcel, tamanos: Tamano[]): Partial<Record<Tamano, number>>; // omite cantidades 0
```

- [ ] **Step 1: Escribir la prueba**

`tests/migracion/limpiar.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import {
  type Aviso, POR_ASIGNAR, cantidadesPorTamano, clave, limpiarInsumos, mapearCategoriaProducto, normalizarUnidad, tamanosDeProducto,
} from '../../scripts/migracion/limpiar';
import type { InsumoExcel, LineaExcel } from '../../scripts/migracion/tipos';

const insumo = (o: Partial<InsumoExcel>): InsumoExcel => ({
  fila: 5, nombre: 'X', proveedor: 'CEDIS', categoria: 'INSUMOS', costoPaquete: 10, presentacion: 100, unidad: 'gr', ...o,
});
const linea = (o: Partial<LineaExcel>): LineaExcel => ({
  fila: 5, producto: 'P', clasificacion: null, insumo: 'X', cantChica: 0, cantGrande: 0, ...o,
});

describe('clave', () => {
  it('ignora mayúsculas y espacios de más, como MATCH de Excel', () => {
    expect(clave('  agua ')).toBe(clave('AGUA'));
    expect(clave('Café  Tostado')).toBe('CAFÉ TOSTADO');
  });
});

describe('normalizarUnidad', () => {
  it('unifica pcs y pza', () => {
    expect(normalizarUnidad('pcs')).toBe('pza');
    expect(normalizarUnidad('PZA')).toBe('pza');
    expect(normalizarUnidad(' gr ')).toBe('gr');
    expect(normalizarUnidad('ml')).toBe('ml');
  });
  it('rechaza unidades desconocidas', () => {
    expect(() => normalizarUnidad('kg')).toThrow('Unidad desconocida: "kg"');
    expect(() => normalizarUnidad(null)).toThrow();
  });
});

describe('limpiarInsumos', () => {
  it('presentación 0 queda en 1 con costo 0 (igual que IFERROR del Excel) y avisa', () => {
    const avisos: Aviso[] = [];
    const [agua] = limpiarInsumos([insumo({ nombre: 'AGUA', costoPaquete: 0, presentacion: 0, unidad: 'ml' })], avisos);
    expect(agua).toMatchObject({ costoPaquete: 0, presentacion: 1 });
    expect(avisos.map((a) => a.tipo)).toEqual(['Presentación ajustada']);
  });
  it('costo con presentación 0 queda en costo 0 y avisa', () => {
    const avisos: Aviso[] = [];
    const [x] = limpiarInsumos([insumo({ costoPaquete: 50, presentacion: 0 })], avisos);
    expect(x).toMatchObject({ costoPaquete: 0, presentacion: 1 });
    expect(avisos[0].detalle).toContain('50');
  });
  it('proveedor o categoría vacíos quedan POR ASIGNAR y avisa', () => {
    const avisos: Aviso[] = [];
    const [x] = limpiarInsumos([insumo({ nombre: 'Chobani', proveedor: null, categoria: null })], avisos);
    expect(x).toMatchObject({ proveedor: POR_ASIGNAR, categoria: POR_ASIGNAR });
    expect(avisos).toHaveLength(2);
  });
  it('rechaza nombres repetidos que solo difieren en mayúsculas o espacios', () => {
    expect(() => limpiarInsumos([insumo({ nombre: 'AGUA' }), insumo({ nombre: 'agua ' })], [])).toThrow(/repetido/);
  });
});

describe('categorías de producto', () => {
  it('unifica duplicados y temporada, deja intactas las demás', () => {
    expect(mapearCategoriaProducto('SANDWICHES')).toBe('Sandwiches');
    expect(mapearCategoriaProducto('Sandwiches')).toBe('Sandwiches');
    expect(mapearCategoriaProducto('GELATO FRAPPÉ')).toBe('Gelato Frappés');
    expect(mapearCategoriaProducto('PUMPKIN SPICE LATTE')).toBe('Seasonal');
    expect(mapearCategoriaProducto('Cold')).toBe('Cold');
  });
});

describe('tamaños', () => {
  it('Chica y Grande si alguna línea tiene cantidad grande; si no, Único', () => {
    expect(tamanosDeProducto([linea({ cantChica: 18 }), linea({ cantGrande: 20 })])).toEqual(['Chica', 'Grande']);
    expect(tamanosDeProducto([linea({ cantChica: 1 })])).toEqual(['Único']);
    expect(tamanosDeProducto([])).toEqual(['Único']);
  });
  it('reparte cantidades por tamaño omitiendo ceros', () => {
    expect(cantidadesPorTamano(linea({ cantChica: 18, cantGrande: 20 }), ['Chica', 'Grande'])).toEqual({ Chica: 18, Grande: 20 });
    expect(cantidadesPorTamano(linea({ cantChica: 0, cantGrande: 20 }), ['Chica', 'Grande'])).toEqual({ Grande: 20 });
    expect(cantidadesPorTamano(linea({ cantChica: 1, cantGrande: 0 }), ['Único'])).toEqual({ Único: 1 });
  });
});
```

- [ ] **Step 2: Correr la prueba para verificar que falla**

Run: `npx vitest run tests/migracion/limpiar.test.ts`
Expected: FAIL con `Cannot find module`.

- [ ] **Step 3: Implementar**

`scripts/migracion/equivalencias.ts`:
```ts
/**
 * Categorías de producto del Excel → categoría final en el portal.
 * PROPUESTA: Finanzas/Dirección la valida en el reporte de migración antes de aplicar.
 * Las categorías que no aparecen aquí se migran con su nombre original.
 */
export const EQUIVALENCIAS_CATEGORIA: Record<string, string> = {
  SANDWICHES: 'Sandwiches',
  Sandwiches: 'Sandwiches',
  'GELATO FRAPPÉ': 'Gelato Frappés',
  'Gelato Frappés': 'Gelato Frappés',
  'PUMPKIN SPICE FRAPPÉ': 'Seasonal',
  'PUMPKIN SPICE ICED LATTE': 'Seasonal',
  'PUMPKIN SPICE LATTE': 'Seasonal',
  Seasonal: 'Seasonal',
};
```

`scripts/migracion/limpiar.ts`:
```ts
import { EQUIVALENCIAS_CATEGORIA } from './equivalencias';
import type { InsumoExcel, LineaExcel, Tamano } from './tipos';

export const POR_ASIGNAR = 'POR ASIGNAR';
export interface Aviso { tipo: string; detalle: string }
export type Unidad = 'gr' | 'ml' | 'pza';
export interface InsumoLimpio { nombre: string; proveedor: string; categoria: string; costoPaquete: number; presentacion: number; unidad: Unidad }

export function clave(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toUpperCase();
}

export function normalizarUnidad(u: string | null): Unidad {
  const k = (u ?? '').trim().toLowerCase();
  if (k === 'gr' || k === 'g') return 'gr';
  if (k === 'ml') return 'ml';
  if (k === 'pcs' || k === 'pza' || k === 'pz' || k === 'pieza') return 'pza';
  throw new Error(`Unidad desconocida: "${u}"`);
}

export function limpiarInsumos(insumos: InsumoExcel[], avisos: Aviso[]): InsumoLimpio[] {
  const vistos = new Set<string>();
  return insumos.map((i) => {
    const k = clave(i.nombre);
    if (vistos.has(k)) throw new Error(`Insumo repetido en el catálogo: "${i.nombre}" (fila ${i.fila})`);
    vistos.add(k);
    let { costoPaquete, presentacion } = i;
    if (presentacion <= 0) {
      avisos.push({
        tipo: 'Presentación ajustada',
        detalle: `${i.nombre} (fila ${i.fila}): presentación ${presentacion} y costo ${costoPaquete}. Queda con presentación 1 y costo 0, igual que calculaba el Excel.`,
      });
      costoPaquete = 0;
      presentacion = 1;
    }
    if (!i.proveedor) avisos.push({ tipo: 'Proveedor por asignar', detalle: `${i.nombre} (fila ${i.fila})` });
    if (!i.categoria) avisos.push({ tipo: 'Categoría de insumo por asignar', detalle: `${i.nombre} (fila ${i.fila})` });
    return {
      nombre: i.nombre,
      proveedor: i.proveedor ?? POR_ASIGNAR,
      categoria: i.categoria ?? POR_ASIGNAR,
      costoPaquete,
      presentacion,
      unidad: normalizarUnidad(i.unidad),
    };
  });
}

export function mapearCategoriaProducto(original: string): string {
  return EQUIVALENCIAS_CATEGORIA[original] ?? original;
}

export function tamanosDeProducto(lineas: LineaExcel[]): Tamano[] {
  return lineas.some((l) => l.cantGrande > 0) ? ['Chica', 'Grande'] : ['Único'];
}

export function cantidadesPorTamano(linea: LineaExcel, tamanos: Tamano[]): Partial<Record<Tamano, number>> {
  if (tamanos.includes('Único')) return linea.cantChica > 0 ? { Único: linea.cantChica } : {};
  const r: Partial<Record<Tamano, number>> = {};
  if (linea.cantChica > 0) r.Chica = linea.cantChica;
  if (linea.cantGrande > 0) r.Grande = linea.cantGrande;
  return r;
}
```

- [ ] **Step 4: Correr la prueba**

Run: `npx vitest run tests/migracion/limpiar.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(migracion): limpieza de insumos, unidades, tamaños y categorías

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Detección de sub-recetas a partir de las líneas MIX

**Files:**
- Create: `scripts/migracion/subrecetas.ts`
- Test: `tests/migracion/subrecetas.test.ts`

**Interfaces:**
- Consumes: `Tamano`, `clave`.
- Produces:
```ts
export interface LineaLimpia { fila: number; producto: string; insumo: string; clasificacion: string | null; cantidades: Partial<Record<Tamano, number>> }
export interface SubrecetaPropuesta { nombre: string; rendimiento: number; componentes: { insumo: string; cantidad: number }[]; productos: string[] }
export interface UsoSubreceta { producto: string; subreceta: string; filas: number[]; cantidades: Partial<Record<Tamano, number>> }
export interface MixSinAgrupar { producto: string; insumos: string[]; motivo: string }
export interface ResultadoSubrecetas { subrecetas: SubrecetaPropuesta[]; usos: UsoSubreceta[]; sinAgrupar: MixSinAgrupar[] }
export const RENDIMIENTO_LOTE = 1000;
export function detectarSubrecetas(lineas: LineaLimpia[], costoUnitario: Map<string, number>): ResultadoSubrecetas;
```
`insumo` en `LineaLimpia` es el nombre exacto del catálogo (ya resuelto). `costoUnitario` está indexado por ese nombre.

**Algoritmo (debe implementarse exactamente así):**
1. Tomar las líneas con `clasificacion === 'MIX'` agrupadas por producto, en el orden del Excel.
2. Si el MIX de un producto tiene un solo insumo distinto → `sinAgrupar` motivo `'Un solo insumo: no es una mezcla'`. Si repite un insumo → motivo `'Insumo repetido dentro del mix'`.
3. Para cada producto y cada tamaño con total > 0: `total = Σ cantidades`, proporción `p_i = q_i / total`.
4. Grupos por conjunto de insumos (clave = nombres ordenados). Dentro de un grupo, un producto se une a un *cluster* existente si, **en todos sus tamaños**, `|p_i − P_i| ≤ 0.005` para cada insumo (P = proporciones canónicas del cluster). Si no encaja en ninguno, abre un cluster nuevo cuyas proporciones canónicas son las del primer tamaño con total > 0; si sus otros tamaños no encajan en esas proporciones → `sinAgrupar` motivo `'Proporción distinta entre tamaños'` y no se crea el cluster.
5. Clusters con ≥ 2 productos → `SubrecetaPropuesta`: rendimiento 1000, componentes `cantidad = round6(P_i × 1000)` en el orden de la primera aparición, nombre `'Mix ' + insumos sin AGUA ni HIELO unidos por ' + '` (si todos son agua/hielo, todos); si el nombre ya existe se agrega `' (2)'`, `' (3)'`… Cada miembro produce un `UsoSubreceta` con las filas MIX que reemplaza y, por tamaño, la cantidad que **conserva exactamente el costo original**: `cantidad_t = round6(Σ q_i·c_i / costoPorUnidad)` con `costoPorUnidad = Σ cantidad_componente·c_i / 1000` (si `costoPorUnidad = 0`, `cantidad_t = round6(total_t)`). Así las pequeñas diferencias de redondeo del Excel entre tamaños no mueven el costo.
6. Clusters de 1 producto → `sinAgrupar` motivo `'Proporción única: no se reutiliza en otro producto'`.

- [ ] **Step 1: Escribir la prueba**

`tests/migracion/subrecetas.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { detectarSubrecetas, type LineaLimpia } from '../../scripts/migracion/subrecetas';

let fila = 0;
const mix = (producto: string, insumo: string, cantidades: LineaLimpia['cantidades']): LineaLimpia =>
  ({ fila: ++fila, producto, insumo, clasificacion: 'MIX', cantidades });
const costos = new Map([['AGUA', 0], ['MATCHA', 1.2], ['CHAI', 0.5], ['LIMON', 0.05], ['AZUCAR', 0.05]]);

describe('detectarSubrecetas', () => {
  const lineas: LineaLimpia[] = [
    mix('Matcha Latte', 'AGUA', { Chica: 32.14, Grande: 40.18 }),
    mix('Matcha Latte', 'MATCHA', { Chica: 3.86, Grande: 4.82 }),
    mix('Matcha Iced', 'AGUA', { Chica: 32.14, Grande: 40.179 }),
    mix('Matcha Iced', 'MATCHA', { Chica: 3.86, Grande: 4.821 }),
    mix('Matcha Frappé', 'AGUA', { Único: 32.14 }),
    mix('Matcha Frappé', 'MATCHA', { Único: 3.86 }),
    mix('Chai Iced', 'AGUA', { Chica: 32 }),
    mix('Chai Iced', 'CHAI', { Chica: 4 }),
    mix('Chai Latte', 'AGUA', { Chica: 42 }),
    mix('Chai Latte', 'CHAI', { Chica: 4 }),
    mix('Limonada', 'LIMON', { Único: 16 }),
    { fila: ++fila, producto: 'Matcha Latte', insumo: 'VASO', clasificacion: 'DESECHABLE', cantidades: { Chica: 1 } },
  ];
  const r = detectarSubrecetas(lineas, costos);

  it('agrupa productos con la misma proporción en una sub-receta de lote 1000', () => {
    expect(r.subrecetas).toHaveLength(1);
    const s = r.subrecetas[0];
    expect(s.nombre).toBe('Mix MATCHA');
    expect(s.rendimiento).toBe(1000);
    expect(s.productos).toEqual(['Matcha Latte', 'Matcha Iced', 'Matcha Frappé']);
    expect(s.componentes.map((c) => c.insumo)).toEqual(['AGUA', 'MATCHA']);
    expect(s.componentes[1].cantidad).toBeCloseTo((3.86 / 36) * 1000, 4);
  });

  it('cada producto usa la sub-receta con la cantidad que conserva exactamente su costo', () => {
    const uso = r.usos.find((u) => u.producto === 'Matcha Iced')!;
    expect(uso.subreceta).toBe('Mix MATCHA');
    expect(uso.filas).toHaveLength(2);
    expect(uso.cantidades.Chica).toBeCloseTo(36, 4);
    expect(uso.cantidades.Grande).toBeCloseTo(45, 0);                 // ≈ total del mix
    const s = r.subrecetas[0];
    const costoPorUnidad = s.componentes.reduce((acc, c) => acc + (c.cantidad / s.rendimiento) * costos.get(c.insumo)!, 0);
    expect(uso.cantidades.Chica! * costoPorUnidad).toBeCloseTo(3.86 * 1.2, 5);
    expect(uso.cantidades.Grande! * costoPorUnidad).toBeCloseTo(4.821 * 1.2, 5);  // grande con proporción redondeada distinta
  });

  it('no agrupa un mix cuya proporción cambia entre tamaños', () => {
    const r2 = detectarSubrecetas([
      mix('Sora Iced', 'AGUA', { Chica: 35.64, Grande: 44.55 }),
      mix('Sora Iced', 'LIMON', { Chica: 100, Grande: 200 }),
    ], costos);
    expect(r2.sinAgrupar[0]).toMatchObject({ producto: 'Sora Iced', motivo: 'Proporción distinta entre tamaños' });
  });

  it('no mezcla proporciones distintas aunque los insumos sean los mismos', () => {
    const motivos = Object.fromEntries(r.sinAgrupar.map((s) => [s.producto, s.motivo]));
    expect(motivos['Chai Iced']).toMatch(/Proporción única/);
    expect(motivos['Chai Latte']).toMatch(/Proporción única/);
  });

  it('un mix de un solo insumo no es sub-receta', () => {
    expect(r.sinAgrupar.find((s) => s.producto === 'Limonada')?.motivo).toMatch(/Un solo insumo/);
  });

  it('solo toca líneas MIX', () => {
    expect(r.usos.flatMap((u) => u.filas)).not.toContain(fila);
  });
});
```

- [ ] **Step 2: Correr la prueba para verificar que falla**

Run: `npx vitest run tests/migracion/subrecetas.test.ts`
Expected: FAIL con `Cannot find module`.

- [ ] **Step 3: Implementar**

`scripts/migracion/subrecetas.ts`:
```ts
import type { Tamano } from './tipos';

export interface LineaLimpia { fila: number; producto: string; insumo: string; clasificacion: string | null; cantidades: Partial<Record<Tamano, number>> }
export interface SubrecetaPropuesta { nombre: string; rendimiento: number; componentes: { insumo: string; cantidad: number }[]; productos: string[] }
export interface UsoSubreceta { producto: string; subreceta: string; filas: number[]; cantidades: Partial<Record<Tamano, number>> }
export interface MixSinAgrupar { producto: string; insumos: string[]; motivo: string }
export interface ResultadoSubrecetas { subrecetas: SubrecetaPropuesta[]; usos: UsoSubreceta[]; sinAgrupar: MixSinAgrupar[] }

export export const RENDIMIENTO_LOTE = 1000;
const TOLERANCIA_PROPORCION = 0.005;
const SIN_NOMBRE = new Set(['AGUA', 'HIELO']);
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

interface MixProducto {
  producto: string;
  insumos: string[];                                       // orden de aparición
  filas: number[];
  porTamano: Map<Tamano, Map<string, number>>;             // tamaño → insumo → cantidad (solo tamaños con total > 0)
}
interface Cluster { insumos: string[]; proporciones: Map<string, number>; miembros: MixProducto[] }

function agruparPorProducto(lineas: LineaLimpia[]): MixProducto[] {
  const porProducto = new Map<string, LineaLimpia[]>();
  for (const l of lineas) {
    if (l.clasificacion !== 'MIX') continue;
    const lista = porProducto.get(l.producto) ?? [];
    lista.push(l);
    porProducto.set(l.producto, lista);
  }
  return [...porProducto.entries()].map(([producto, ls]) => {
    const porTamano = new Map<Tamano, Map<string, number>>();
    for (const l of ls) {
      for (const [t, q] of Object.entries(l.cantidades) as [Tamano, number][]) {
        const m = porTamano.get(t) ?? new Map<string, number>();
        m.set(l.insumo, (m.get(l.insumo) ?? 0) + q);
        porTamano.set(t, m);
      }
    }
    for (const [t, m] of porTamano) if ([...m.values()].reduce((a, b) => a + b, 0) <= 0) porTamano.delete(t);
    return { producto, insumos: ls.map((l) => l.insumo), filas: ls.map((l) => l.fila), porTamano };
  });
}

const total = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

function encaja(mix: MixProducto, cluster: Cluster): boolean {
  for (const m of mix.porTamano.values()) {
    const t = total(m);
    for (const insumo of cluster.insumos) {
      if (Math.abs((m.get(insumo) ?? 0) / t - cluster.proporciones.get(insumo)!) > TOLERANCIA_PROPORCION) return false;
    }
  }
  return true;
}

function nombreBase(insumos: string[]): string {
  const visibles = insumos.filter((i) => !SIN_NOMBRE.has(i.toUpperCase()));
  return 'Mix ' + (visibles.length > 0 ? visibles : insumos).join(' + ');
}

export function detectarSubrecetas(lineas: LineaLimpia[], costoUnitario: Map<string, number>): ResultadoSubrecetas {
  const sinAgrupar: MixSinAgrupar[] = [];
  const clustersPorClave = new Map<string, Cluster[]>();
  const ordenClusters: Cluster[] = [];

  for (const mix of agruparPorProducto(lineas)) {
    const distintos = [...new Set(mix.insumos)];
    if (distintos.length < 2) {
      sinAgrupar.push({ producto: mix.producto, insumos: distintos, motivo: 'Un solo insumo: no es una mezcla' });
      continue;
    }
    if (distintos.length !== mix.insumos.length) {
      sinAgrupar.push({ producto: mix.producto, insumos: distintos, motivo: 'Insumo repetido dentro del mix' });
      continue;
    }
    if (mix.porTamano.size === 0) {
      sinAgrupar.push({ producto: mix.producto, insumos: distintos, motivo: 'Mix sin cantidades' });
      continue;
    }
    const k = [...distintos].sort().join('|');
    const candidatos = clustersPorClave.get(k) ?? [];
    const existente = candidatos.find((c) => encaja(mix, c));
    if (existente) {
      existente.miembros.push(mix);
      continue;
    }
    const primero = [...mix.porTamano.values()][0];
    const t = total(primero);
    const nuevo: Cluster = {
      insumos: distintos,
      proporciones: new Map(distintos.map((i) => [i, (primero.get(i) ?? 0) / t])),
      miembros: [mix],
    };
    if (!encaja(mix, nuevo)) {
      sinAgrupar.push({ producto: mix.producto, insumos: distintos, motivo: 'Proporción distinta entre tamaños' });
      continue;
    }
    candidatos.push(nuevo);
    clustersPorClave.set(k, candidatos);
    ordenClusters.push(nuevo);
  }

  const subrecetas: SubrecetaPropuesta[] = [];
  const usos: UsoSubreceta[] = [];
  const nombresUsados = new Map<string, number>();
  for (const c of ordenClusters) {
    if (c.miembros.length < 2) {
      sinAgrupar.push({ producto: c.miembros[0].producto, insumos: c.insumos, motivo: 'Proporción única: no se reutiliza en otro producto' });
      continue;
    }
    const base = nombreBase(c.insumos);
    const veces = (nombresUsados.get(base) ?? 0) + 1;
    nombresUsados.set(base, veces);
    const nombre = veces === 1 ? base : `${base} (${veces})`;
    const componentes = c.insumos.map((i) => ({ insumo: i, cantidad: round6(c.proporciones.get(i)! * RENDIMIENTO_LOTE) }));
    const costoPorUnidad = componentes.reduce((acc, comp) => acc + comp.cantidad * (costoUnitario.get(comp.insumo) ?? 0), 0) / RENDIMIENTO_LOTE;
    subrecetas.push({ nombre, rendimiento: RENDIMIENTO_LOTE, componentes, productos: c.miembros.map((m) => m.producto) });
    for (const m of c.miembros) {
      const cantidades: Partial<Record<Tamano, number>> = {};
      for (const [t, mapa] of m.porTamano) {
        const costoOriginal = [...mapa].reduce((acc, [insumo, q]) => acc + q * (costoUnitario.get(insumo) ?? 0), 0);
        cantidades[t] = round6(costoPorUnidad > 0 ? costoOriginal / costoPorUnidad : total(mapa));
      }
      usos.push({ producto: m.producto, subreceta: nombre, filas: m.filas, cantidades });
    }
  }
  return { subrecetas, usos, sinAgrupar };
}
```

- [ ] **Step 4: Correr la prueba**

Run: `npx vitest run tests/migracion/subrecetas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(migracion): detección de sub-recetas desde líneas MIX

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Plan de carga y carga a la base

**Files:**
- Create: `scripts/migracion/plan-carga.ts`, `scripts/migracion/cargar.ts`
- Test: `tests/migracion/plan-carga.test.ts`, `tests/migracion/cargar.test.ts`

**Interfaces:**
- Consumes: `LibroExcel`, `limpiar.ts`, `detectarSubrecetas`, `Ejecutor`, `crearDbLocal`.
- Produces:
```ts
// plan-carga.ts
export interface PlanCarga {
  parametros: { iva: number; margenObjetivo: number };
  rappi: { comision: number; envase: number; markupMax: number };
  proveedores: { id: string; nombre: string }[];
  categoriasInsumo: { id: string; nombre: string }[];
  categoriasProducto: { id: string; nombre: string; orden: number }[];
  insumos: { id: string; nombre: string; proveedorId: string; categoriaId: string; costoPaquete: number; presentacion: number; unidad: Unidad }[];
  recetas: { id: string; nombre: string; tipo: 'producto' | 'subreceta'; categoriaId: string | null; rendimiento: number | null; unidadRendimiento: Unidad | null }[];
  productoTamanos: { productoId: string; tamano: Tamano; precioLista: number | null }[];
  lineas: { id: string; recetaId: string; insumoId: string | null; subrecetaId: string | null; orden: number }[];
  cantidades: { lineaId: string; tamano: Tamano | null; cantidad: number }[];
  historial: { tabla: string; campo: string; anterior: string | null; nuevo: string | null; nota: string | null }[];
  equivalencias: { original: string; final: string; productos: number }[];
  subrecetas: ResultadoSubrecetas;
  avisos: Aviso[];
}
export function construirPlanCarga(libro: LibroExcel): PlanCarga;
// cargar.ts
export async function cargarPlan(db: Ejecutor, plan: PlanCarga): Promise<void>;   // lanza si la base ya tiene insumos
```

- [ ] **Step 1: Escribir la prueba del plan (pura)**

`tests/migracion/plan-carga.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { construirPlanCarga } from '../../scripts/migracion/plan-carga';
import type { LibroExcel } from '../../scripts/migracion/tipos';

export const libroDePrueba = (): LibroExcel => ({
  parametros: { iva: 0.16, comisionRappi: 0.18, envaseRappi: 6.14, markupMaxRappi: 0.25, margenObjetivo: 0.55 },
  insumos: [
    { fila: 5, nombre: 'AGUA', proveedor: 'Agua', categoria: 'AGUA', costoPaquete: 0, presentacion: 0, unidad: 'ml' },
    { fila: 6, nombre: 'MATCHA', proveedor: 'CEDIS', categoria: 'INSUMOS', costoPaquete: 1200, presentacion: 1000, unidad: 'gr' },
    { fila: 7, nombre: 'VASO', proveedor: 'CEDIS', categoria: 'DESECHABLE', costoPaquete: 100, presentacion: 50, unidad: 'pcs' },
  ],
  lineas: [
    { fila: 5, producto: 'Matcha Latte', clasificacion: 'MIX', insumo: 'agua ', cantChica: 32.14, cantGrande: 40.18 },
    { fila: 6, producto: 'Matcha Latte', clasificacion: 'MIX', insumo: 'MATCHA', cantChica: 3.86, cantGrande: 4.82 },
    { fila: 7, producto: 'Matcha Latte', clasificacion: 'DESECHABLE', insumo: 'VASO', cantChica: 1, cantGrande: 1 },
    { fila: 8, producto: 'Matcha Iced', clasificacion: 'MIX', insumo: 'AGUA', cantChica: 32.14, cantGrande: 40.18 },
    { fila: 9, producto: 'Matcha Iced', clasificacion: 'MIX', insumo: 'MATCHA', cantChica: 3.86, cantGrande: 4.82 },
    { fila: 10, producto: 'Agua sola', clasificacion: 'AGUA', insumo: 'AGUA', cantChica: 0, cantGrande: 0 },
  ],
  productos: [
    { fila: 5, categoria: 'BEBIDAS CALIENTES', nombre: 'Matcha Latte', costoChica: 6.632, costoGrande: 7.784, precioChica: 70, precioGrande: 0, precioRappi: 0, margenRappi: 0, alerta: '' },
    { fila: 6, categoria: 'SANDWICHES', nombre: 'Matcha Iced', costoChica: 4.632, costoGrande: 5.784, precioChica: 0, precioGrande: 0, precioRappi: 0, margenRappi: 0, alerta: 'Falta precio de lista' },
    { fila: 7, categoria: 'Sandwiches', nombre: 'Agua sola', costoChica: 0, costoGrande: 0, precioChica: 10, precioGrande: 0, precioRappi: 0, margenRappi: 0, alerta: '' },
  ],
  cambios: [{ hoja: 'Correcciones', seccion: 'Correcciones', campo: 'Matcha Latte · CH · MATCHA', anterior: '3.5', nuevo: '3.86', nota: 'gramaje ajustado' }],
});

describe('construirPlanCarga', () => {
  const plan = construirPlanCarga(libroDePrueba());
  const receta = (nombre: string) => plan.recetas.find((r) => r.nombre === nombre)!;

  it('liga insumos del recetario sin distinguir mayúsculas ni espacios', () => {
    const agua = plan.insumos.find((i) => i.nombre === 'AGUA')!;
    const sub = receta('Mix MATCHA');
    expect(plan.lineas.some((l) => l.recetaId === sub.id && l.insumoId === agua.id)).toBe(true);
  });

  it('reemplaza las líneas MIX por una línea de sub-receta y deja las demás', () => {
    const p = receta('Matcha Latte');
    const lineas = plan.lineas.filter((l) => l.recetaId === p.id);
    expect(lineas).toHaveLength(2);
    expect(lineas[0].subrecetaId).toBe(receta('Mix MATCHA').id);
    const cant = plan.cantidades.filter((c) => c.lineaId === lineas[0].id);
    expect(cant.map((c) => c.tamano)).toEqual(['Chica', 'Grande']);
    expect(cant[0].cantidad).toBeCloseTo(36, 4);
    expect(cant[1].cantidad).toBeCloseTo(45, 0);
  });

  it('crea la sub-receta con lote 1000 ml y cantidades sin tamaño', () => {
    const s = receta('Mix MATCHA');
    expect(s).toMatchObject({ tipo: 'subreceta', categoriaId: null, rendimiento: 1000, unidadRendimiento: 'ml' });
    const lineas = plan.lineas.filter((l) => l.recetaId === s.id);
    expect(plan.cantidades.filter((c) => lineas.some((l) => l.id === c.lineaId)).every((c) => c.tamano === null)).toBe(true);
  });

  it('asigna tamaños y precios (0 → sin precio)', () => {
    const tamanos = (n: string) => plan.productoTamanos.filter((t) => t.productoId === receta(n).id).map((t) => [t.tamano, t.precioLista]);
    expect(tamanos('Matcha Latte')).toEqual([['Chica', 70], ['Grande', null]]);
    expect(tamanos('Matcha Iced')).toEqual([['Chica', null], ['Grande', null]]);
    expect(tamanos('Agua sola')).toEqual([['Único', 10]]);
  });

  it('unifica categorías y reporta equivalencias', () => {
    expect(plan.categoriasProducto.map((c) => c.nombre).sort()).toEqual(['BEBIDAS CALIENTES', 'Sandwiches']);
    expect(plan.equivalencias).toContainEqual({ original: 'SANDWICHES', final: 'Sandwiches', productos: 1 });
  });

  it('avisa líneas sin cantidad, presentación ajustada y unifica pcs → pza', () => {
    expect(plan.avisos.map((a) => a.tipo)).toEqual(expect.arrayContaining(['Línea sin cantidad', 'Presentación ajustada']));
    expect(plan.insumos.find((i) => i.nombre === 'VASO')!.unidad).toBe('pza');
  });

  it('pasa el historial del Excel y los parámetros', () => {
    expect(plan.historial).toEqual([{ tabla: 'excel_correcciones', campo: 'Matcha Latte · CH · MATCHA', anterior: '3.5', nuevo: '3.86', nota: 'gramaje ajustado' }]);
    expect(plan.rappi).toEqual({ comision: 0.18, envase: 6.14, markupMax: 0.25 });
  });
});
```

- [ ] **Step 2: Escribir la prueba de carga (integración con PGlite)**

`tests/migracion/cargar.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import { cargarPlan } from '../../scripts/migracion/cargar';
import { construirPlanCarga } from '../../scripts/migracion/plan-carga';
import { libroDePrueba } from './plan-carga.test';

describe('cargarPlan', () => {
  it('carga todo y los costos de la base cuadran con el Excel', async () => {
    const db = await crearDbLocal();
    const libro = libroDePrueba();
    await cargarPlan(db, construirPlanCarga(libro));
    const r = await db.query<{ producto: string; tamano: string; costo: string }>(
      `select r.nombre as producto, t.nombre as tamano, c.costo
       from v_costo_producto c join recetas r on r.id = c.producto_id join tamanos t on t.id = c.tamano_id`);
    const costo = (p: string, t: string) => Number(r.rows.find((x) => x.producto === p && x.tamano === t)!.costo);
    expect(costo('Matcha Latte', 'Chica')).toBeCloseTo(6.632, 2);
    expect(costo('Matcha Latte', 'Grande')).toBeCloseTo(7.784, 2);
    expect(costo('Matcha Iced', 'Chica')).toBeCloseTo(4.632, 2);
  });

  it('no deja bitácora de portal, sí el historial del Excel con origen migracion', async () => {
    const db = await crearDbLocal();
    await cargarPlan(db, construirPlanCarga(libroDePrueba()));
    const r = await db.query<{ origen: string; tabla: string }>('select origen, tabla from bitacora');
    expect(r.rows).toEqual([{ origen: 'migracion', tabla: 'excel_correcciones' }]);
  });

  it('aborta sin duplicar si la base ya tiene datos', async () => {
    const db = await crearDbLocal();
    const plan = construirPlanCarga(libroDePrueba());
    await cargarPlan(db, plan);
    await expect(cargarPlan(db, plan)).rejects.toThrow(/base ya tiene insumos/);
    const r = await db.query<{ n: number }>('select count(*)::int as n from insumos');
    expect(Number(r.rows[0].n)).toBe(3);
  });

  it('si algo falla a la mitad no deja nada cargado', async () => {
    const db = await crearDbLocal();
    const plan = construirPlanCarga(libroDePrueba());
    plan.cantidades.push({ lineaId: plan.lineas[0].id, tamano: 'Único', cantidad: 1 }); // lineas[0] es de la sub-receta: una cantidad con tamaño → error del trigger
    await expect(cargarPlan(db, plan)).rejects.toThrow();
    const r = await db.query<{ n: number }>('select count(*)::int as n from recetas');
    expect(Number(r.rows[0].n)).toBe(0);
  });
});
```

- [ ] **Step 3: Correr las pruebas para verificar que fallan**

Run: `npx vitest run tests/migracion/plan-carga.test.ts tests/migracion/cargar.test.ts`
Expected: FAIL con `Cannot find module`.

- [ ] **Step 4: Implementar el plan de carga**

`scripts/migracion/plan-carga.ts`:
```ts
import { randomUUID } from 'node:crypto';
import {
  type Aviso, type Unidad, cantidadesPorTamano, clave, limpiarInsumos, mapearCategoriaProducto, tamanosDeProducto,
} from './limpiar';
import { type LineaLimpia, type ResultadoSubrecetas, detectarSubrecetas } from './subrecetas';
import type { LibroExcel, LineaExcel, Tamano } from './tipos';

export interface PlanCarga {
  parametros: { iva: number; margenObjetivo: number };
  rappi: { comision: number; envase: number; markupMax: number };
  proveedores: { id: string; nombre: string }[];
  categoriasInsumo: { id: string; nombre: string }[];
  categoriasProducto: { id: string; nombre: string; orden: number }[];
  insumos: { id: string; nombre: string; proveedorId: string; categoriaId: string; costoPaquete: number; presentacion: number; unidad: Unidad }[];
  recetas: { id: string; nombre: string; tipo: 'producto' | 'subreceta'; categoriaId: string | null; rendimiento: number | null; unidadRendimiento: Unidad | null }[];
  productoTamanos: { productoId: string; tamano: Tamano; precioLista: number | null }[];
  lineas: { id: string; recetaId: string; insumoId: string | null; subrecetaId: string | null; orden: number }[];
  cantidades: { lineaId: string; tamano: Tamano | null; cantidad: number }[];
  historial: { tabla: string; campo: string; anterior: string | null; nuevo: string | null; nota: string | null }[];
  equivalencias: { original: string; final: string; productos: number }[];
  subrecetas: ResultadoSubrecetas;
  avisos: Aviso[];
}

function catalogo(nombres: string[]): { id: string; nombre: string }[] {
  return [...new Set(nombres)].sort((a, b) => a.localeCompare(b, 'es')).map((nombre) => ({ id: randomUUID(), nombre }));
}

export function construirPlanCarga(libro: LibroExcel): PlanCarga {
  const avisos: Aviso[] = [];
  const insumosLimpios = limpiarInsumos(libro.insumos, avisos);

  const proveedores = catalogo(insumosLimpios.map((i) => i.proveedor));
  const categoriasInsumo = catalogo(insumosLimpios.map((i) => i.categoria));
  const idProveedor = new Map(proveedores.map((p) => [p.nombre, p.id]));
  const idCategoriaInsumo = new Map(categoriasInsumo.map((c) => [c.nombre, c.id]));
  const insumos = insumosLimpios.map((i) => ({
    id: randomUUID(), nombre: i.nombre, proveedorId: idProveedor.get(i.proveedor)!, categoriaId: idCategoriaInsumo.get(i.categoria)!,
    costoPaquete: i.costoPaquete, presentacion: i.presentacion, unidad: i.unidad,
  }));
  const insumoPorClave = new Map(insumos.map((i) => [clave(i.nombre), i]));
  const costoUnitario = new Map(insumos.map((i) => [i.nombre, i.costoPaquete / i.presentacion]));

  // Categorías de producto con equivalencias
  const conteo = new Map<string, { final: string; productos: number }>();
  for (const p of libro.productos) {
    const e = conteo.get(p.categoria) ?? { final: mapearCategoriaProducto(p.categoria), productos: 0 };
    e.productos += 1;
    conteo.set(p.categoria, e);
  }
  const equivalencias = [...conteo.entries()]
    .map(([original, e]) => ({ original, final: e.final, productos: e.productos }))
    .sort((a, b) => a.final.localeCompare(b.final, 'es') || a.original.localeCompare(b.original, 'es'));
  const categoriasProducto = catalogo(equivalencias.map((e) => e.final)).map((c, i) => ({ ...c, orden: i + 1 }));
  const idCategoriaProducto = new Map(categoriasProducto.map((c) => [c.nombre, c.id]));

  // Líneas del Excel por producto, con insumo resuelto
  const lineasPorProducto = new Map<string, LineaExcel[]>();
  const nombresProducto = new Set(libro.productos.map((p) => p.nombre));
  for (const l of libro.lineas) {
    if (!nombresProducto.has(l.producto)) {
      avisos.push({ tipo: 'Producto sin fila en Resumen', detalle: `${l.producto} (fila ${l.fila} del Recetario): línea omitida` });
      continue;
    }
    const lista = lineasPorProducto.get(l.producto) ?? [];
    lista.push(l);
    lineasPorProducto.set(l.producto, lista);
  }

  const tamanosPorProducto = new Map<string, Tamano[]>();
  const lineasLimpias: LineaLimpia[] = [];
  for (const p of libro.productos) {
    const ls = lineasPorProducto.get(p.nombre) ?? [];
    const tamanos = tamanosDeProducto(ls);
    tamanosPorProducto.set(p.nombre, tamanos);
    for (const l of ls) {
      const insumo = insumoPorClave.get(clave(l.insumo));
      if (!insumo) {
        avisos.push({ tipo: 'Insumo no encontrado', detalle: `${l.producto} → "${l.insumo}" (fila ${l.fila} del Recetario): línea omitida` });
        continue;
      }
      const cantidades = cantidadesPorTamano(l, tamanos);
      if (Object.keys(cantidades).length === 0) {
        avisos.push({ tipo: 'Línea sin cantidad', detalle: `${l.producto} → ${insumo.nombre} (fila ${l.fila} del Recetario): línea omitida` });
        continue;
      }
      lineasLimpias.push({ fila: l.fila, producto: l.producto, insumo: insumo.nombre, clasificacion: l.clasificacion, cantidades });
    }
  }

  const subrecetas = detectarSubrecetas(lineasLimpias, costoUnitario);

  const recetas: PlanCarga['recetas'] = [];
  const productoTamanos: PlanCarga['productoTamanos'] = [];
  const lineas: PlanCarga['lineas'] = [];
  const cantidades: PlanCarga['cantidades'] = [];
  const insumoPorNombre = new Map(insumos.map((i) => [i.nombre, i]));

  const idSubreceta = new Map<string, string>();
  for (const s of subrecetas.subrecetas) {
    const id = randomUUID();
    idSubreceta.set(s.nombre, id);
    recetas.push({ id, nombre: s.nombre, tipo: 'subreceta', categoriaId: null, rendimiento: s.rendimiento, unidadRendimiento: 'ml' });
    s.componentes.forEach((c, orden) => {
      const lineaId = randomUUID();
      lineas.push({ id: lineaId, recetaId: id, insumoId: insumoPorNombre.get(c.insumo)!.id, subrecetaId: null, orden });
      cantidades.push({ lineaId, tamano: null, cantidad: c.cantidad });
    });
  }

  const usoPorFila = new Map<number, (typeof subrecetas.usos)[number]>();
  for (const u of subrecetas.usos) for (const f of u.filas) usoPorFila.set(f, u);

  for (const p of libro.productos) {
    const id = randomUUID();
    recetas.push({
      id, nombre: p.nombre, tipo: 'producto', categoriaId: idCategoriaProducto.get(mapearCategoriaProducto(p.categoria))!,
      rendimiento: null, unidadRendimiento: null,
    });
    for (const t of tamanosPorProducto.get(p.nombre)!) {
      const precio = t === 'Grande' ? p.precioGrande : p.precioChica;
      productoTamanos.push({ productoId: id, tamano: t, precioLista: precio > 0 ? precio : null });
    }
    let orden = 0;
    const usosEmitidos = new Set<string>();
    for (const l of lineasLimpias.filter((x) => x.producto === p.nombre)) {
      const uso = usoPorFila.get(l.fila);
      if (uso) {
        if (usosEmitidos.has(uso.subreceta)) continue;
        usosEmitidos.add(uso.subreceta);
        const lineaId = randomUUID();
        lineas.push({ id: lineaId, recetaId: id, insumoId: null, subrecetaId: idSubreceta.get(uso.subreceta)!, orden: orden++ });
        for (const [t, q] of Object.entries(uso.cantidades) as [Tamano, number][]) cantidades.push({ lineaId, tamano: t, cantidad: q });
        continue;
      }
      const lineaId = randomUUID();
      lineas.push({ id: lineaId, recetaId: id, insumoId: insumoPorNombre.get(l.insumo)!.id, subrecetaId: null, orden: orden++ });
      for (const [t, q] of Object.entries(l.cantidades) as [Tamano, number][]) cantidades.push({ lineaId, tamano: t, cantidad: q });
    }
  }

  return {
    parametros: { iva: libro.parametros.iva, margenObjetivo: libro.parametros.margenObjetivo },
    rappi: { comision: libro.parametros.comisionRappi, envase: libro.parametros.envaseRappi, markupMax: libro.parametros.markupMaxRappi },
    proveedores, categoriasInsumo, categoriasProducto, insumos, recetas, productoTamanos, lineas, cantidades,
    historial: libro.cambios.map((c) => ({
      tabla: c.hoja === 'Auditoria' ? 'excel_auditoria' : 'excel_correcciones',
      campo: c.campo, anterior: c.anterior, nuevo: c.nuevo, nota: c.nota,
    })),
    equivalencias, subrecetas, avisos,
  };
}
```

- [ ] **Step 5: Implementar la carga**

`scripts/migracion/cargar.ts`:
```ts
import type { Ejecutor } from '../db/ejecutor';
import type { PlanCarga } from './plan-carga';

/** Carga el plan en una sola transacción. Solo corre sobre una base sin insumos. */
export async function cargarPlan(db: Ejecutor, plan: PlanCarga): Promise<void> {
  const existentes = await db.query<{ n: number }>('select count(*)::int as n from insumos');
  if (Number(existentes.rows[0].n) > 0) {
    throw new Error('La base ya tiene insumos: la migración solo corre sobre una base vacía');
  }
  await db.query('begin');
  try {
    await db.query(`select set_config('app.origen', 'migracion', true)`);
    await db.query('update parametros set iva = $1, margen_objetivo = $2 where id = 1', [plan.parametros.iva, plan.parametros.margenObjetivo]);
    await db.query(`update canales set comision_pct = $1, costo_envase = $2, markup_max_pct = $3 where nombre = 'Rappi'`,
      [plan.rappi.comision, plan.rappi.envase, plan.rappi.markupMax]);
    await db.query(`update canales set costo_envase = $1 where nombre = 'App propia'`, [plan.rappi.envase]);

    const tamanos = await db.query<{ id: string; nombre: string }>('select id, nombre from tamanos');
    const idTamano = new Map(tamanos.rows.map((t) => [t.nombre, t.id]));

    for (const p of plan.proveedores) await db.query('insert into proveedores (id, nombre) values ($1, $2)', [p.id, p.nombre]);
    for (const c of plan.categoriasInsumo) await db.query('insert into categorias_insumo (id, nombre) values ($1, $2)', [c.id, c.nombre]);
    for (const c of plan.categoriasProducto) {
      await db.query('insert into categorias_producto (id, nombre, orden) values ($1, $2, $3)', [c.id, c.nombre, c.orden]);
    }
    for (const i of plan.insumos) {
      await db.query(
        `insert into insumos (id, nombre, proveedor_id, categoria_id, costo_paquete, presentacion, unidad)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [i.id, i.nombre, i.proveedorId, i.categoriaId, i.costoPaquete, i.presentacion, i.unidad]);
    }
    for (const r of plan.recetas) {
      await db.query(
        `insert into recetas (id, nombre, tipo, categoria_id, rendimiento, unidad_rendimiento) values ($1, $2, $3, $4, $5, $6)`,
        [r.id, r.nombre, r.tipo, r.categoriaId, r.rendimiento, r.unidadRendimiento]);
    }
    for (const t of plan.productoTamanos) {
      await db.query('insert into producto_tamanos (producto_id, tamano_id, precio_lista) values ($1, $2, $3)',
        [t.productoId, idTamano.get(t.tamano), t.precioLista]);
    }
    for (const l of plan.lineas) {
      await db.query('insert into receta_lineas (id, receta_id, insumo_id, subreceta_id, orden) values ($1, $2, $3, $4, $5)',
        [l.id, l.recetaId, l.insumoId, l.subrecetaId, l.orden]);
    }
    for (const c of plan.cantidades) {
      await db.query('insert into linea_cantidades (linea_id, tamano_id, cantidad) values ($1, $2, $3)',
        [c.lineaId, c.tamano === null ? null : idTamano.get(c.tamano), c.cantidad]);
    }
    for (const h of plan.historial) {
      await db.query(
        `insert into bitacora (tabla, campo, valor_anterior, valor_nuevo, nota, origen) values ($1, $2, $3, $4, $5, 'migracion')`,
        [h.tabla, h.campo, h.anterior, h.nuevo, h.nota]);
    }
    await db.query('commit');
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}
```

- [ ] **Step 6: Correr las pruebas**

Run: `npx vitest run tests/migracion`
Expected: PASS. Nota: `cargar.test.ts` importa `libroDePrueba` desde `plan-carga.test.ts`; Vitest ejecuta también las pruebas de ese archivo al importarlo — es aceptable. Si molesta, mover `libroDePrueba` a `tests/migracion/libro-de-prueba.ts` y actualizar ambos imports.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(migracion): plan de carga y carga transaccional

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Conciliación, reporte, CLI y prueba de paridad con el Excel real

**Files:**
- Create: `scripts/migracion/conciliar.ts`, `scripts/migracion/reporte.ts`, `scripts/migracion/index.ts`
- Test: `tests/migracion/paridad.test.ts`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces:
```ts
// conciliar.ts
export interface FilaConciliacion { producto: string; tamano: Tamano; costoExcel: number; costoPortal: number; diferencia: number; ok: boolean }
export async function conciliar(db: Ejecutor, libro: LibroExcel): Promise<FilaConciliacion[]>;
// reporte.ts
export function escribirReporte(ruta: string, plan: PlanCarga, conciliacion: FilaConciliacion[]): void;
// index.ts (CLI): npm run migracion -- [--excel <ruta>] [--reporte <ruta>] [--aplicar]
```

- [ ] **Step 1: Escribir la prueba de paridad**

`tests/migracion/paridad.test.ts`:
```ts
import { existsSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { cargarPlan } from '../../scripts/migracion/cargar';
import { conciliar } from '../../scripts/migracion/conciliar';
import { leerLibro } from '../../scripts/migracion/leer-excel';
import { type PlanCarga, construirPlanCarga } from '../../scripts/migracion/plan-carga';
import type { LibroExcel } from '../../scripts/migracion/tipos';

const RUTA = process.env.EXCEL_COSTEO ?? 'datos/Modelo_Costeo_Corregido_2026.xlsx';
const ALERTA_PORTAL: Record<string, string | null> = {
  '': null,
  'Falta precio de lista': 'Falta precio de lista',
  'Vende por debajo del costo': 'Vende por debajo del costo',
  'Markup Rappi sobre el tope': 'Markup sobre el tope',
  'Pierde dinero en Rappi': 'Pierde dinero en el canal',
  'Margen bajo el objetivo': 'Margen bajo el objetivo',
};

let db: PGlite;
let libro: LibroExcel;
let plan: PlanCarga;

beforeAll(async () => {
  if (!existsSync(RUTA)) throw new Error(`Copia el Excel de costeo a ${RUTA} (o define EXCEL_COSTEO)`);
  libro = leerLibro(RUTA);
  plan = construirPlanCarga(libro);
  db = await crearDbLocal();
  await cargarPlan(db, plan);
});

describe('paridad con el Excel real', () => {
  it('migra todos los productos e insumos', async () => {
    const r = await db.query<{ productos: number; insumos: number }>(
      `select (select count(*)::int from recetas where tipo = 'producto') as productos, (select count(*)::int from insumos) as insumos`);
    expect(r.rows[0]).toEqual({ productos: libro.productos.length, insumos: libro.insumos.length });
  });

  it('el costo de cada producto y tamaño cuadra con el Excel (±$0.01)', async () => {
    const filas = await conciliar(db, libro);
    const fallas = filas.filter((f) => !f.ok);
    expect(fallas, JSON.stringify(fallas.slice(0, 10), null, 2)).toEqual([]);
    expect(filas.length).toBeGreaterThanOrEqual(libro.productos.length);
  });

  it('precio y margen Rappi cuadran en el tamaño que usaba el Excel', async () => {
    const r = await db.query<{ producto: string; tamano: string; precio_canal: string; margen: string }>(
      `select producto, tamano, precio_canal, margen from v_resumen where canal = 'Rappi'`);
    const fallas: string[] = [];
    for (const p of libro.productos.filter((x) => x.precioRappi > 0)) {
      const tamanos = r.rows.filter((x) => x.producto === p.nombre).map((x) => x.tamano);
      const tamano = p.precioGrande > 0 ? 'Grande' : tamanos.includes('Único') ? 'Único' : 'Chica';
      const fila = r.rows.find((x) => x.producto === p.nombre && x.tamano === tamano);
      if (!fila || Number(fila.precio_canal) !== p.precioRappi || Math.abs(Number(fila.margen) - p.margenRappi) > 0.01) {
        fallas.push(`${p.nombre} (${tamano}): Excel ${p.precioRappi}/${p.margenRappi.toFixed(2)} vs portal ${fila?.precio_canal}/${Number(fila?.margen).toFixed(2)}`);
      }
    }
    expect(fallas).toEqual([]);
  });

  it('la alerta de cada producto en el canal Rappi es la del Excel', async () => {
    const r = await db.query<{ producto: string; alerta: string | null }>(
      `select producto, alerta from v_alerta_producto_canal where canal = 'Rappi'`);
    const porProducto = new Map(r.rows.map((x) => [x.producto, x.alerta]));
    const fallas: string[] = [];
    for (const p of libro.productos) {
      const esperado = ALERTA_PORTAL[p.alerta];
      const portal = porProducto.get(p.nombre) ?? null;
      if (portal === esperado) continue;
      // Diferencia intencional (spec §4.3): el portal evalúa Rappi en todos los tamaños; el Excel solo en uno.
      const dosTamanosConPrecio = p.precioChica > 0 && p.precioGrande > 0;
      if (dosTamanosConPrecio && portal === 'Pierde dinero en el canal') continue;
      fallas.push(`${p.nombre}: Excel "${p.alerta}" vs portal "${portal}"`);
    }
    expect(fallas).toEqual([]);
  });

  it('propone al menos una sub-receta reutilizada', () => {
    expect(plan.subrecetas.subrecetas.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Correr la prueba para verificar que falla**

Run: `npx vitest run tests/migracion/paridad.test.ts`
Expected: FAIL con `Cannot find module '../../scripts/migracion/conciliar'`.

- [ ] **Step 3: Implementar la conciliación**

`scripts/migracion/conciliar.ts`:
```ts
import type { Ejecutor } from '../db/ejecutor';
import type { LibroExcel, Tamano } from './tipos';

export interface FilaConciliacion { producto: string; tamano: Tamano; costoExcel: number; costoPortal: number; diferencia: number; ok: boolean }

const TOLERANCIA = 0.01;

export async function conciliar(db: Ejecutor, libro: LibroExcel): Promise<FilaConciliacion[]> {
  const { rows } = await db.query<{ producto: string; tamano: Tamano; costo: string }>(
    `select r.nombre as producto, t.nombre as tamano, c.costo
     from v_costo_producto c
     join recetas r on r.id = c.producto_id
     join tamanos t on t.id = c.tamano_id`);
  const porProducto = new Map<string, { tamano: Tamano; costo: number }[]>();
  for (const r of rows) {
    const lista = porProducto.get(r.producto) ?? [];
    lista.push({ tamano: r.tamano, costo: Number(r.costo) });
    porProducto.set(r.producto, lista);
  }
  const resultado: FilaConciliacion[] = [];
  for (const p of libro.productos) {
    const enPortal = porProducto.get(p.nombre);
    if (!enPortal) {
      resultado.push({ producto: p.nombre, tamano: 'Único', costoExcel: p.costoChica, costoPortal: Number.NaN, diferencia: Number.NaN, ok: false });
      continue;
    }
    for (const { tamano, costo } of enPortal) {
      const costoExcel = tamano === 'Grande' ? p.costoGrande : p.costoChica;
      const diferencia = costo - costoExcel;
      resultado.push({ producto: p.nombre, tamano, costoExcel, costoPortal: costo, diferencia, ok: Math.abs(diferencia) <= TOLERANCIA });
    }
  }
  return resultado;
}
```

- [ ] **Step 4: Implementar el reporte**

`scripts/migracion/reporte.ts`:
```ts
import { writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import type { FilaConciliacion } from './conciliar';
import type { PlanCarga } from './plan-carga';

const r2 = (n: number) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : null);

export function escribirReporte(ruta: string, plan: PlanCarga, conciliacion: FilaConciliacion[]): void {
  const wb = XLSX.utils.book_new();
  const fallas = conciliacion.filter((c) => !c.ok);
  const agregar = (nombre: string, filas: Record<string, unknown>[]) =>
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas.length ? filas : [{ '(sin filas)': '' }]), nombre);

  agregar('Resumen', [
    { Concepto: 'Insumos', Valor: plan.insumos.length },
    { Concepto: 'Productos', Valor: plan.recetas.filter((r) => r.tipo === 'producto').length },
    { Concepto: 'Sub-recetas propuestas', Valor: plan.subrecetas.subrecetas.length },
    { Concepto: 'Mixes que se quedan como ingredientes', Valor: plan.subrecetas.sinAgrupar.length },
    { Concepto: 'Avisos', Valor: plan.avisos.length },
    { Concepto: 'Productos×tamaño conciliados', Valor: conciliacion.length },
    { Concepto: 'Diferencias de costo > $0.01', Valor: fallas.length },
    { Concepto: 'Resultado', Valor: fallas.length === 0 ? 'CUADRA — se puede aplicar' : 'NO CUADRA — no aplicar' },
  ]);
  agregar('Conciliación', conciliacion.map((c) => ({
    Producto: c.producto, Tamaño: c.tamano, 'Costo Excel': r2(c.costoExcel), 'Costo portal': r2(c.costoPortal),
    Diferencia: r2(c.diferencia), Cuadra: c.ok ? 'Sí' : 'NO',
  })));
  agregar('Equivalencias categorías', plan.equivalencias.map((e) => ({
    'Categoría en Excel': e.original, 'Categoría en portal': e.final, Productos: e.productos, Cambia: e.original === e.final ? '' : 'Sí',
  })));
  agregar('Sub-recetas', plan.subrecetas.subrecetas.flatMap((s) => s.componentes.map((c, i) => ({
    'Sub-receta': i === 0 ? s.nombre : '', 'Rendimiento (ml)': i === 0 ? s.rendimiento : '', Insumo: c.insumo, Cantidad: c.cantidad,
    'Usada en': i === 0 ? s.productos.join(', ') : '',
  }))));
  agregar('Mixes sin agrupar', plan.subrecetas.sinAgrupar.map((s) => ({ Producto: s.producto, Insumos: s.insumos.join(', '), Motivo: s.motivo })));
  agregar('Avisos', plan.avisos.map((a) => ({ Tipo: a.tipo, Detalle: a.detalle })));

  writeFileSync(ruta, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
```

- [ ] **Step 5: Implementar el CLI**

`scripts/migracion/index.ts`:
```ts
import { parseArgs } from 'node:util';
import pg from 'pg';
import type { Ejecutor } from '../db/ejecutor';
import { crearDbLocal } from '../db/pglite';
import { cargarPlan } from './cargar';
import { conciliar } from './conciliar';
import { leerLibro } from './leer-excel';
import { construirPlanCarga } from './plan-carga';
import { escribirReporte } from './reporte';

const { values } = parseArgs({
  options: {
    excel: { type: 'string', default: 'datos/Modelo_Costeo_Corregido_2026.xlsx' },
    reporte: { type: 'string', default: 'datos/reporte-migracion.xlsx' },
    aplicar: { type: 'boolean', default: false },
  },
});

async function main() {
  const libro = leerLibro(values.excel!);
  const plan = construirPlanCarga(libro);

  console.log('1/3 Ensayo en base local (PGlite)…');
  const local = await crearDbLocal();
  await cargarPlan(local, plan);
  const conciliacion = await conciliar(local, libro);
  escribirReporte(values.reporte!, plan, conciliacion);
  const fallas = conciliacion.filter((c) => !c.ok);
  console.log(`2/3 Reporte: ${values.reporte}  ·  ${conciliacion.length} productos×tamaño, ${fallas.length} diferencias, ${plan.avisos.length} avisos, ${plan.subrecetas.subrecetas.length} sub-recetas`);
  if (fallas.length > 0) {
    console.error('La conciliación NO cuadra. Revisa la hoja "Conciliación" del reporte. No se aplicó nada.');
    process.exit(1);
  }
  if (!values.aplicar) {
    console.log('3/3 Ensayo correcto. Para cargar en Supabase: npm run migracion -- --aplicar');
    return;
  }

  try { process.loadEnvFile('.env.local'); } catch { /* opcional */ }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Falta DATABASE_URL (cadena de conexión de Supabase) en .env.local');
  const cliente = new pg.Client({ connectionString: url });
  await cliente.connect();
  try {
    const remoto: Ejecutor = { query: (sql, params) => cliente.query(sql, params as unknown[]) as never };
    console.log('3/3 Cargando en Supabase…');
    await cargarPlan(remoto, plan);
    const remota = await conciliar(remoto, libro);
    const fallasRemotas = remota.filter((c) => !c.ok);
    console.log(fallasRemotas.length === 0 ? 'Listo: Supabase cuadra con el Excel.' : `ATENCIÓN: ${fallasRemotas.length} diferencias en Supabase.`);
    if (fallasRemotas.length > 0) process.exit(1);
  } finally {
    await cliente.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
```

- [ ] **Step 6: Correr la paridad y el ensayo**

Run: `npx vitest run tests/migracion/paridad.test.ts`
Expected: PASS. Si "el costo… cuadra" falla, el mensaje lista los primeros 10 productos con diferencia: revisar en `plan.avisos` si hay insumos no encontrados o líneas omitidas y corregir la causa (no relajar la tolerancia). Si falla la alerta, revisar si la diferencia cae en la excepción documentada; cualquier otra es un bug.

Run: `npm run migracion`
Expected: `2/3 Reporte: datos/reporte-migracion.xlsx · … 0 diferencias …` y `3/3 Ensayo correcto.` Abrir el reporte y anotar cuántas sub-recetas y avisos salieron.

- [ ] **Step 7: Correr toda la suite y typecheck**

Run: `npm test && npm run typecheck`
Expected: todo PASS, sin errores de tipos.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(migracion): conciliación, reporte, CLI y prueba de paridad con el Excel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Revisión del reporte con el usuario y publicación en Supabase

Esta tarea requiere acciones del usuario (cuenta de Supabase, contraseña de la base, aprobación de equivalencias). **El agente no crea cuentas ni captura contraseñas**: se detiene y pide al usuario cada paso marcado 👤.

**Files:**
- Create: `README.md`, `.env.example`

- [ ] **Step 1: Pedir revisión del reporte** 👤

Compartir `datos/reporte-migracion.xlsx` y pedir al usuario que valide: hoja *Equivalencias categorías*, hoja *Sub-recetas* (nombres y agrupación), hoja *Avisos* y *Mixes sin agrupar*. Si pide cambios de equivalencias, editar `scripts/migracion/equivalencias.ts`, correr `npm test` y `npm run migracion`, y volver a compartir. Commit de cualquier cambio.

- [ ] **Step 2: Documentar**

`.env.example`:
```
# Cadena de conexión de Supabase (Project Settings → Database → Connection string → Session pooler)
DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

`README.md`:
````markdown
# Portal de Costeos The Coffee

Base de datos (Supabase/Postgres) con el costeo de productos: insumos, recetas, sub-recetas, márgenes por canal y bitácora.

## Requisitos
- Node 24+
- No hace falta Docker: las pruebas usan PGlite (Postgres en proceso).

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

## Publicar el esquema
```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push
```
````

- [ ] **Step 3: Crear el proyecto en Supabase** 👤

Pedir al usuario: crear un proyecto en supabase.com (región sugerida: la más cercana a México, p. ej. `us-east-1` o `us-west-1`), anotar el *project ref* y guardar la contraseña de la base. Pedirle que cree `.env.local` con `DATABASE_URL` (a partir de `.env.example`); el agente no escribe la contraseña.

- [ ] **Step 4: Publicar el esquema** 👤 (login interactivo)

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push
```
Expected: se aplican las 6 migraciones sin error.

- [ ] **Step 5: Cargar los datos**

Run: `npm run migracion -- --aplicar`
Expected: `Listo: Supabase cuadra con el Excel.`

- [ ] **Step 6: Primer administrador** 👤

Pedir al usuario que, en Supabase → Authentication → Users, invite su correo. Luego, en el SQL Editor:
```sql
insert into perfiles (user_id, nombre, rol)
select id, 'Administrador', 'admin' from auth.users where email = '<correo del usuario>';
```

- [ ] **Step 7: Commit**

```bash
git add README.md .env.example
git commit -m "docs: cómo probar, migrar y publicar la base

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Cobertura del spec en este plan

| Spec | Task |
|---|---|
| §4.1 tablas de configuración, catálogos, insumos | 2 |
| §4.1 recetas, líneas, cantidades, tamaños | 3 |
| §4.2 ciclos, desactivar en vez de borrar, tamaños válidos | 3, 7 |
| §4.3 vistas de costo, resumen, alertas | 4, 5 |
| §2 App propia con comisión por confirmar | 2 (`comision_confirmada`), 5 |
| §6 permisos por rol | 6, 7 |
| Bitácora | 6 |
| §7 migración, limpieza, sub-recetas, reporte, conciliación | 8–12 |
| §9.1 paridad con el Excel; §9.2 pruebas SQL | 12; 2–7 |
| §3 hosting Supabase | 13 |
| §5 pantallas, §8 manejo de errores en UI, carga masiva, exportación, Vercel, e2e | **Plan 2 y Plan 3** |
