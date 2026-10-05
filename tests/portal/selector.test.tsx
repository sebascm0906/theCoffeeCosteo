import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { SelectorComponente } from '../../components/recetas/selector-componente';
it('busca y selecciona por teclado un ID sin ofrecer inactivos', async () => {
  const cambiar = vi.fn();
  render(
    <SelectorComponente
      value=""
      onChange={cambiar}
      opciones={[
        { id: 'cafe', nombre: 'Café', tipo: 'insumo', unidad: 'gr', costo: 0.4, activo: true },
        { id: 'mix', nombre: 'Mix chocolate', tipo: 'subreceta', unidad: 'ml', costo: 0.2, activo: true },
        { id: 'inactivo', nombre: 'Azúcar viejo', tipo: 'insumo', unidad: 'gr', costo: 0.1, activo: false },
      ]}
    />,
  );
  await userEvent.click(screen.getByRole('combobox', { name: 'Componente' }));
  const buscar = screen.getByPlaceholderText('Buscar ingrediente o sub-receta…');
  await userEvent.type(buscar, 'chocolate');
  expect(screen.queryByText('Azúcar viejo')).toBeNull();
  fireEvent.keyDown(buscar, { key: 'ArrowDown' });
  fireEvent.keyDown(buscar, { key: 'Enter' });
  await waitFor(() => expect(cambiar).toHaveBeenCalledWith('mix'));
});
