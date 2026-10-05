import { createRoot } from 'react-dom/client';
import { EditorReceta } from '../../../components/recetas/editor-receta';
import { TablaResumen } from '../../../components/portal/tabla-resumen';
import type { Resumen } from '../../../lib/supabase/database.types';
import '../../../app/globals.css';
const fila = {
  producto_id: 'p',
  producto: 'Latte de prueba',
  activo: true,
  categoria: 'Bebidas',
  tamano_id: 't',
  tamano: 'Único',
  canal_id: 'c',
  canal: 'Mostrador',
  costo: 8.5,
  precio_canal: 60,
  precio_manual: null,
  margen_pct: 0.7,
  margen_objetivo: 0.55,
} as Resumen;
createRoot(document.getElementById('root')!).render(
  <main className="max-w-6xl mx-auto p-6 space-y-6">
    <p className="aviso">PRUEBA VISUAL · DATOS SINTÉTICOS · Sin Auth ni conexión a bases de datos</p>
    <h1>Resumen y editor de recetas</h1>
    <TablaResumen filas={[fila]} alertas={[]} />
    <EditorReceta
      inicial={{
        nombre: 'Latte de prueba',
        tipo: 'producto',
        categoria_id: 'c',
        rendimiento: null,
        unidad_rendimiento: null,
        activo: true,
        tamanos: ['t'],
        lineas: [
          { insumo_id: 'cafe', subreceta_id: null, orden: 0, cantidades: [{ tamano_id: 't', cantidad: 18 }] },
        ],
      }}
      categorias={[{ id: 'c', nombre: 'Bebidas', activo: true }]}
      tamanos={[{ id: 't', nombre: 'Único', orden: 1 }]}
      opciones={[
        { id: 'cafe', nombre: 'Café', tipo: 'insumo', unidad: 'gr', costo: 0.3, activo: true },
        { id: 'leche', nombre: 'Leche', tipo: 'insumo', unidad: 'ml', costo: 0.024, activo: true },
        { id: 'mix', nombre: 'Mix chocolate', tipo: 'subreceta', unidad: 'ml', costo: 0.08, activo: true },
      ]}
      editable
    />
  </main>,
);
