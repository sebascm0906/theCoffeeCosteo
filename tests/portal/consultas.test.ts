import { expect, it, vi } from 'vitest';
import { todas, type Db, dinero, porcentaje } from '../../lib/portal/consultas';
it('consulta todas las páginas y falla si el API falla en una página posterior', async () => {
  const range = vi
    .fn()
    .mockResolvedValueOnce({ data: Array.from({ length: 500 }, (_, i) => ({ id: String(i) })), error: null })
    .mockResolvedValueOnce({ data: [{ id: '500' }], error: null });
  const q = { order: vi.fn().mockReturnThis(), range };
  const db = { from: vi.fn().mockReturnValue({ select: () => q }) } as unknown as Db;
  expect(await todas(db, 'insumos', 'id')).toHaveLength(501);
  expect(range).toHaveBeenLastCalledWith(500, 999);
  range.mockResolvedValueOnce({ data: null, error: { message: 'error' } });
  await expect(todas(db, 'insumos', 'id')).rejects.toThrow('No se pudo consultar');
});
it('preserva nulo frente a cero', () => {
  expect(dinero(null)).toBe('Sin precio');
  expect(dinero(0)).toContain('0.00');
  expect(porcentaje(null)).toBe('—');
});
