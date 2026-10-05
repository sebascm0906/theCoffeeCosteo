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
