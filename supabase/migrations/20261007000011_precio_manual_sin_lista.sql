-- Un precio aprobado de delivery es válido aunque el precio de mostrador falte.
-- Mostrador/calculado/markup siguen ausentes si no hay precio de lista.
create or replace view v_resumen with (security_invoker = true) as
with base as (
  select
    r.id as producto_id, r.nombre as producto, r.activo,
    cp.id as categoria_id, cp.nombre as categoria,
    t.id as tamano_id, t.nombre as tamano, t.orden as tamano_orden,
    c.id as canal_id, c.nombre as canal, c.orden as canal_orden, c.regla_precio,
    c.comision_pct, c.comision_confirmada, c.costo_envase, c.markup_max_pct,
    nullif(pt.precio_lista, 0) as precio_lista,
    pm.precio as precio_manual_capturado,
    cpr.costo, cpr.usa_inactivo,
    par.iva, par.margen_objetivo
  from producto_tamanos pt
  join recetas r on r.id = pt.producto_id
  join categorias_producto cp on cp.id = r.categoria_id
  join tamanos t on t.id = pt.tamano_id
  join v_costo_producto cpr on cpr.producto_id = pt.producto_id and cpr.tamano_id = pt.tamano_id
  cross join canales c
  cross join parametros par
  left join precio_canal_manual pm
    on pm.producto_id = pt.producto_id and pm.tamano_id = pt.tamano_id and pm.canal_id = c.id
),
con_calculado as (
  select b.*,
    case
      when b.precio_lista is null then null
      when b.regla_precio = 'mostrador' then b.precio_lista
      else least(
        round(b.precio_lista / (1 - b.comision_pct) + b.costo_envase * (1 + b.iva) / (1 - b.comision_pct), 0),
        case when b.markup_max_pct is null then null else floor(b.precio_lista * (1 + b.markup_max_pct)) end
      )
    end as precio_calculado,
    b.precio_manual_capturado as precio_manual
  from base b
),
con_precio as (
  select c.*, coalesce(c.precio_manual, c.precio_calculado) as precio_canal from con_calculado c
),
con_venta as (
  select p.*, p.precio_canal / (1 + p.iva) as venta_neta from con_precio p
)
select
  v.producto_id, v.producto, v.activo, v.categoria_id, v.categoria, v.tamano_id, v.tamano, v.tamano_orden,
  v.canal_id, v.canal, v.canal_orden, v.regla_precio, v.comision_pct, v.comision_confirmada, v.costo_envase,
  v.markup_max_pct, v.precio_lista, v.costo, v.usa_inactivo, v.iva, v.margen_objetivo,
  v.precio_calculado, v.precio_manual, v.precio_canal, v.venta_neta,
  v.costo / v.venta_neta as food_cost,
  v.venta_neta - v.venta_neta * v.comision_pct - v.costo - v.costo_envase as margen,
  (v.venta_neta - v.venta_neta * v.comision_pct - v.costo - v.costo_envase) / v.venta_neta as margen_pct,
  v.precio_canal / v.precio_lista - 1 as markup
from con_venta v;

