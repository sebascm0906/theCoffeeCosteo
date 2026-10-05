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
