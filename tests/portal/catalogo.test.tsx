import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { CatalogoRecetas } from '../../components/recetas/catalogo';
import { Navegacion } from '../../components/portal/navegacion';
vi.mock('next/navigation', () => ({ usePathname: () => '/productos/receta-1' }));
it('pagina, filtra desde la segunda página y permite consultar a usuarios sin edición', async () => {
  const filas = Array.from({ length: 30 }, (_, i) => ({
    id: String(i),
    nombre: `Receta ${i}`,
    activo: i !== 29,
  }));
  render(<CatalogoRecetas filas={filas} tipo="producto" editable={false} />);
  expect(screen.queryByRole('link', { name: /Crear producto/ })).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('1–25 de 30');
  await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  expect(screen.getByRole('link', { name: 'Receta 29' })).toHaveAttribute('href', '/productos/29');
  await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar por nombre' }), 'Receta 0');
  expect(screen.getByRole('status')).toHaveTextContent('1–1 de 1');
  await userEvent.selectOptions(screen.getByLabelText('Estado'), 'inactivos');
  expect(screen.getByText('No hay resultados')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
});
it('ofrece alta de sub-receta y conserva el filtro inicial', () => {
  render(
    <CatalogoRecetas
      filas={[{ id: '1', nombre: 'Mix', activo: true }]}
      tipo="subreceta"
      editable
      consulta="Mix"
    />,
  );
  expect(screen.getByRole('link', { name: /Crear sub-receta/ })).toHaveAttribute('href', '/subrecetas/nueva');
  expect(screen.getByRole('searchbox')).toHaveValue('Mix');
});
it('resalta Productos también dentro de su ficha', () => {
  render(<Navegacion />);
  expect(screen.getByRole('link', { name: 'Productos' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Tablero' })).not.toHaveAttribute('aria-current');
});
