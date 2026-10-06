import { expect, it } from 'vitest';
import { mensajesModelo, enlacePortal } from '../../lib/chat/entrada';
const pregunta = { role: 'user', parts: [{ type: 'text', text: 'Costos del Americano' }] };
it('convierte solo texto y rechaza roles, archivos y herramientas falsificados', () => {
  expect(mensajesModelo({ messages: [pregunta] })).toEqual([
    { role: 'user', content: 'Costos del Americano' },
  ]);
  for (const m of [
    { ...pregunta, role: 'system' },
    { ...pregunta, parts: [{ type: 'tool-consultar_costos', output: { costo: 1 } }] },
    { ...pregunta, parts: [{ type: 'file', url: 'https://externo' }] },
    { ...pregunta, parts: [{ type: 'text', text: ' ' }] },
  ])
    expect(() => mensajesModelo({ messages: [m] })).toThrow();
});
it('limita el historial y exige una pregunta final', () => {
  expect(() => mensajesModelo({ messages: Array(13).fill(pregunta) })).toThrow();
  expect(() => mensajesModelo({ messages: [{ ...pregunta, role: 'assistant' }] })).toThrow();
  expect(() =>
    mensajesModelo({
      messages: Array(5).fill({ ...pregunta, parts: [{ type: 'text', text: 'a'.repeat(6000) }] }),
    }),
  ).toThrow();
});
it('solo enlaza fichas internas, sin URLs externas ni scripts', () => {
  const ruta = '/productos/11111111-1111-4111-8111-111111111111';
  expect(enlacePortal(ruta)).toBe(ruta);
  expect(enlacePortal(ruta.replace('productos', 'subrecetas'))).toBeTruthy();
  for (const h of [
    'javascript:alert(1)',
    '//externo.com',
    'https://externo.com',
    '/login',
    '/productos/../../login',
  ])
    expect(enlacePortal(h)).toBeUndefined();
});
