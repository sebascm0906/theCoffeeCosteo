import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
it('renderiza formularios accesibles en español', () => {
  render(
    <label>
      Nombre
      <input name="nombre" />
    </label>,
  );
  expect(screen.getByRole('textbox', { name: 'Nombre' })).toBeVisible();
});
