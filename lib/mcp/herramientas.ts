import type { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import type { Db } from '../portal/consultas';
import { dependientes } from '../portal/dependencias';
import type { Linea, Receta } from '../supabase/database.types';
const pagina = z.number().int().min(1).max(10000).default(1);
const limite = z.number().int().min(1).max(50).default(25);
const texto = z.string().trim().max(100).default('');
const id = z.uuid();
const anotaciones = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const literal = (valor: string) => `%${valor.replace(/[\\%_]/g, '\\$&')}%`;
function exigir<T>(r: { data: T | null; error: unknown }): NonNullable<T> {
  if (r.error || r.data === null) throw new Error('No se pudo consultar la base. Intenta de nuevo.');
  return r.data as NonNullable<T>;
}
export function resultadoPagina<T>(filas: T[], p: number, n: number) {
  return { datos: filas.slice(0, n), pagina: p, siguiente_pagina: filas.length > n ? p + 1 : null };
}
export function registrarHerramientas(server: McpServer, db: Db) {
  const registrar = <S extends z.ZodRawShape>(
    nombre: string,
    descripcion: string,
    esquema: z.ZodObject<S>,
    consultar: (entrada: z.output<z.ZodObject<S>>) => Promise<Record<string, unknown>>,
  ) => {
    server.registerTool(
      nombre,
      { description: descripcion, inputSchema: esquema, annotations: anotaciones },
      async (entrada) => {
        try {
          const datos = await consultar(esquema.parse(entrada));
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(datos) }],
            structuredContent: datos,
          };
        } catch {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text: 'No se pudo completar la consulta. Revisa el identificador o vuelve a intentarlo.',
              },
            ],
          };
        }
      },
    );
  };
  registrar(
    'buscar_recetas',
    'Busca productos o sub-recetas por nombre. Devuelve IDs para las consultas de detalle; páginas de hasta 50 registros.',
    z.object({
      texto,
      tipo: z.enum(['producto', 'subreceta']).optional(),
      activo: z.boolean().optional(),
      pagina,
      limite,
    }),
    async (e) => {
      let q = db
        .from('recetas')
        .select('id,nombre,tipo,activo,rendimiento,unidad_rendimiento')
        .ilike('nombre', literal(e.texto))
        .order('nombre')
        .order('id');
      if (e.tipo) q = q.eq('tipo', e.tipo);
      if (e.activo !== undefined) q = q.eq('activo', e.activo);
      return resultadoPagina(
        exigir(await q.range((e.pagina - 1) * e.limite, e.pagina * e.limite)),
        e.pagina,
        e.limite,
      );
    },
  );
  registrar(
    'consultar_costos',
    'Costos oficiales, precios (calculados y manuales), food cost y margen de un producto por tamaño/canal. Moneda MXN; porcentajes son fracciones (0.30 = 30%). Null significa dato ausente, no cero.',
    z.object({ producto_id: id, canal: texto, pagina, limite }),
    async (e) => {
      let q = db
        .from('v_resumen')
        .select(
          'producto_id,producto,tamano_id,tamano,canal,costo,precio_lista,precio_calculado,precio_manual,precio_canal,venta_neta,food_cost,margen,margen_pct,margen_objetivo,comision_pct,comision_confirmada,usa_inactivo',
        )
        .eq('producto_id', e.producto_id)
        .order('tamano_orden')
        .order('canal_orden')
        .order('tamano_id')
        .order('canal_id');
      if (e.canal) q = q.ilike('canal', literal(e.canal));
      return {
        moneda: 'MXN',
        porcentajes: 'fracciones',
        ...resultadoPagina(
          exigir(await q.range((e.pagina - 1) * e.limite, e.pagina * e.limite)),
          e.pagina,
          e.limite,
        ),
      };
    },
  );
  registrar(
    'buscar_insumos',
    'Busca ingredientes con costos unitarios, presentación y unidad. Costos en MXN. Devuelve IDs para consultar en qué recetas se usan.',
    z.object({ texto, activo: z.boolean().optional(), pagina, limite }),
    async (e) => {
      let q = db
        .from('insumos')
        .select('id,nombre,activo,unidad,presentacion,costo_paquete,costo_unitario')
        .ilike('nombre', literal(e.texto))
        .order('nombre')
        .order('id');
      if (e.activo !== undefined) q = q.eq('activo', e.activo);
      return {
        moneda: 'MXN',
        ...resultadoPagina(
          exigir(await q.range((e.pagina - 1) * e.limite, e.pagina * e.limite)),
          e.pagina,
          e.limite,
        ),
      };
    },
  );
  registrar(
    'consultar_receta',
    'Consulta cabecera y líneas de una receta, con cantidades por tamaño. Ingredientes y sub-recetas incluyen nombre y unidad. Si es sub-receta incluye costo unitario SQL. Las líneas se paginan; no inventar ingredientes de páginas pendientes.',
    z.object({ receta_id: id, pagina, limite }),
    async (e) => {
      const receta = exigir(
        await db
          .from('recetas')
          .select('id,nombre,tipo,activo,rendimiento,unidad_rendimiento')
          .eq('id', e.receta_id)
          .limit(1),
      )[0];
      if (!receta) throw new Error('No existe la receta');
      const lineas = exigir(
        await db
          .from('receta_lineas')
          .select('id,insumo_id,subreceta_id,orden')
          .eq('receta_id', e.receta_id)
          .order('orden')
          .order('id')
          .range((e.pagina - 1) * e.limite, e.pagina * e.limite),
      );
      const seleccion = lineas.slice(0, e.limite);
      const idsInsumo = seleccion.flatMap((l) => (l.insumo_id ? [l.insumo_id] : []));
      const idsSubreceta = seleccion.flatMap((l) => (l.subreceta_id ? [l.subreceta_id] : []));
      const [cantidades, insumos, subrecetas, tamanos, costos] = await Promise.all([
        seleccion.length
          ? db
              .from('linea_cantidades')
              .select('linea_id,tamano_id,cantidad')
              .in(
                'linea_id',
                seleccion.map((l) => l.id),
              )
              .limit(1001)
          : { data: [], error: null },
        idsInsumo.length
          ? db.from('insumos').select('id,nombre,unidad,activo').in('id', idsInsumo)
          : { data: [], error: null },
        idsSubreceta.length
          ? db.from('recetas').select('id,nombre,unidad_rendimiento,activo').in('id', idsSubreceta)
          : { data: [], error: null },
        db.from('tamanos').select('id,nombre').limit(1001),
        receta.tipo === 'subreceta'
          ? db
              .from('v_costo_subreceta')
              .select('costo_unitario,usa_inactivo')
              .eq('subreceta_id', receta.id)
              .single()
          : { data: null, error: null },
      ]);
      const cant = exigir(cantidades),
        tam = exigir(tamanos),
        ins = exigir(insumos),
        sub = exigir(subrecetas);
      if (cant.length >= 1000 || tam.length >= 1000) throw new Error('Consulta demasiado grande');
      const datos = seleccion.map((l) => ({
        ...l,
        componente: l.insumo_id
          ? ins.find((i) => i.id === l.insumo_id)
          : sub.find((s) => s.id === l.subreceta_id),
        cantidades: cant
          .filter((c) => c.linea_id === l.id)
          .map((c) => ({
            cantidad: c.cantidad,
            tamano_id: c.tamano_id,
            tamano: c.tamano_id ? tam.find((t) => t.id === c.tamano_id)?.nombre : null,
          })),
      }));
      return {
        receta,
        costo_subreceta: receta.tipo === 'subreceta' ? exigir(costos) : null,
        moneda: 'MXN',
        lineas: { ...resultadoPagina(lineas, e.pagina, e.limite), datos },
      };
    },
  );
  registrar(
    'recetas_por_insumo',
    'Localiza todas las recetas que usan un insumo, incluyendo usos indirectos mediante sub-recetas. Devuelve productos y sub-recetas con IDs.',
    z.object({ insumo_id: id, pagina, limite }),
    async (e) => {
      const insumo = exigir(await db.from('insumos').select('id,nombre').eq('id', e.insumo_id).single());
      const lineas: Linea[] = [],
        recetas: Receta[] = [];
      for (let desde = 0; desde < 10000; desde += 500) {
        const [l, r] = await Promise.all([
          db
            .from('receta_lineas')
            .select('id,receta_id,insumo_id,subreceta_id,orden')
            .order('id')
            .range(desde, desde + 499),
          db
            .from('recetas')
            .select('*')
            .order('id')
            .range(desde, desde + 499),
        ]);
        const ls = exigir(l),
          rs = exigir(r);
        lineas.push(...ls);
        recetas.push(...rs);
        if (ls.length < 500 && rs.length < 500) break;
        if (desde === 9500) throw new Error('Consulta demasiado grande');
      }
      const usados = dependientes(lineas, recetas, e.insumo_id, 'insumo')
        .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
        .map(({ id, nombre, tipo, activo }) => ({ id, nombre, tipo, activo }));
      return {
        insumo,
        ...resultadoPagina(
          usados.slice((e.pagina - 1) * e.limite, e.pagina * e.limite + 1),
          e.pagina,
          e.limite,
        ),
      };
    },
  );
  registrar(
    'consultar_alertas',
    'Alertas oficiales por producto y canal: margen bajo, precios ausentes, insumos inactivos u otras condiciones. Las alertas proceden de la vista SQL del portal.',
    z.object({ canal: texto, pagina, limite }),
    async (e) => {
      let q = db
        .from('v_alerta_producto_canal')
        .select('producto_id,producto,categoria,canal,alerta')
        .not('alerta', 'is', null)
        .order('producto_id')
        .order('canal_id');
      if (e.canal) q = q.ilike('canal', literal(e.canal));
      return resultadoPagina(
        exigir(await q.range((e.pagina - 1) * e.limite, e.pagina * e.limite)),
        e.pagina,
        e.limite,
      );
    },
  );
}
