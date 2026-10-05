import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { TablaResumen } from '../../components/portal/tabla-resumen';
import type { Resumen, Alerta } from '../../lib/supabase/database.types';
it('incluye costo cero/sin precio, pagina todos los resultados y mantiene filtros en URL', async () => {
  const filas = Array.from(
    { length: 30 },
    (_, i) =>
      ({
        producto_id: String(i),
        producto: `Producto ${i}`,
        categoria: 'Bebidas',
        tamano_id: 't',
        tamano: 'Único',
        canal_id: 'c',
        canal: 'Mostrador',
        activo: true,
        costo: 0,
        precio_canal: null,
        precio_manual: null,
        margen_pct: null,
        margen_objetivo: 0.55,
      }) as Resumen,
  );
  const alertas = filas.map((f) => ({
    producto_id: f.producto_id,
    canal_id: 'c',
    alerta: 'Falta precio de lista',
  })) as Alerta[];
  render(<TablaResumen filas={filas} alertas={alertas} />);
  expect(screen.getAllByText('Sin precio')).toHaveLength(25);
  await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  expect(screen.getByRole('link', { name: 'Producto 29' })).toBeVisible();
  fireEvent.change(screen.getByLabelText('Buscar producto'), { target: { value: 'Producto 29' } });
  await waitFor(() => expect(screen.getAllByRole('link')).toHaveLength(1));
  expect(window.location.search).toContain('buscar=Producto+29');
});
