import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  registro: vi.fn(async () => ({ ok: true })),
  receta: vi.fn(async () => ({ error: 'La receta cambió; borrador conservado' })),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock('../../app/(portal)/configuracion/actions', () => ({ guardarRegistro: mocks.registro }));
vi.mock('../../app/(portal)/productos/actions', () => ({ guardarReceta: mocks.receta }));
import { FormularioRegistro } from '../../components/portal/formulario-registro';
import { campos } from '../../lib/portal/configuracion';
import { EditorReceta } from '../../components/recetas/editor-receta';
it('convierte porcentajes y guarda solo el payload de configuración', async () => {
  render(
    <FormularioRegistro
      tabla="parametros"
      id={1}
      inicial={{ iva: 0.16, margen_objetivo: 0.55 }}
      campos={campos.parametros}
      editable
    />,
  );
  expect(screen.getByRole('spinbutton', { name: 'IVA (%)' })).toHaveValue(16);
  fireEvent.change(screen.getByRole('spinbutton', { name: 'IVA (%)' }), { target: { value: '18' } });
  await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() =>
    expect(mocks.registro).toHaveBeenCalledWith('parametros', 1, { iva: 0.18, margen_objetivo: 0.55 }),
  );
});
it('deshabilita formulario de consulta', () => {
  render(
    <FormularioRegistro
      tabla="proveedores"
      id="i"
      inicial={{ nombre: 'Proveedor', activo: true }}
      campos={campos.proveedores}
      editable={false}
    />,
  );
  expect(screen.getByLabelText('Nombre')).toBeDisabled();
  expect(screen.queryByRole('button')).toBeNull();
});
it('conserva nombre editado ante conflicto y consulta no permite guardar', async () => {
  const inicial = {
    id: 'r',
    version: 2,
    nombre: 'Mix',
    tipo: 'subreceta' as const,
    categoria_id: null,
    rendimiento: 100,
    unidad_rendimiento: 'ml' as const,
    activo: true,
    tamanos: [],
    lineas: [],
  };
  const { rerender } = render(
    <EditorReceta inicial={inicial} opciones={[]} categorias={[]} tamanos={[]} editable />,
  );
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Mix editado' } });
  await userEvent.click(screen.getByRole('button', { name: 'Guardar receta completa' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Nombre')).toHaveValue('Mix editado');
  rerender(
    <EditorReceta
      inicial={{ ...inicial, version: 3, nombre: 'Mix remoto' }}
      opciones={[]}
      categorias={[]}
      tamanos={[]}
      editable={false}
    />,
  );
  expect(screen.getByLabelText('Nombre')).toHaveValue('Mix editado');
  expect(screen.queryByRole('button', { name: 'Guardar receta completa' })).toBeNull();
});
