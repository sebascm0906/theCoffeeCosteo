-- Los tokens OAuth son delegaciones de consulta. Una sesión habitual del portal
-- no tiene client_id y conserva sus permisos de escritura por rol.
do $$ declare tabla text;
begin
  foreach tabla in array array['parametros','canales','tamanos','proveedores',
    'categorias_insumo','categorias_producto','insumos','recetas',
    'producto_tamanos','receta_lineas','linea_cantidades','perfiles',
    'bitacora','precio_canal_manual'] loop
    execute format('create policy oauth_sin_altas on public.%I as restrictive for insert to authenticated with check ((auth.jwt()->>''client_id'') is null)', tabla);
    execute format('create policy oauth_sin_cambios on public.%I as restrictive for update to authenticated using ((auth.jwt()->>''client_id'') is null) with check ((auth.jwt()->>''client_id'') is null)', tabla);
    execute format('create policy oauth_sin_bajas on public.%I as restrictive for delete to authenticated using ((auth.jwt()->>''client_id'') is null)', tabla);
  end loop;
end $$;

create policy oauth_perfil_propio on public.perfiles as restrictive
  for select to authenticated
  using ((auth.jwt()->>'client_id') is null or user_id = auth.uid());
create policy oauth_sin_bitacora on public.bitacora as restrictive
  for select to authenticated using ((auth.jwt()->>'client_id') is null);

-- La RPC del editor es invoker: sus escrituras también quedan bloqueadas por RLS.
-- Este indicador se crea al final; el MCP falla cerrado si aún no está publicado.
create function public.mcp_lectura_habilitada() returns boolean
language sql stable security invoker set search_path = public, pg_temp
as $$ select true $$;
revoke all on function public.mcp_lectura_habilitada() from public, anon;
grant execute on function public.mcp_lectura_habilitada() to authenticated;
