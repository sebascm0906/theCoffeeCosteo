import type { ComponentProps } from 'react';
export function useRouter() {
  return { push: () => {}, refresh: () => {} };
}
export default function Link(props: ComponentProps<'a'>) {
  return <a {...props} />;
}
export async function guardarReceta(_: unknown) {
  return { error: 'Vista de prueba: los datos se conservan en pantalla y no se escriben en una base.' };
}
export async function guardarRegistro(..._: unknown[]) {
  return { error: 'Vista de prueba: no se escriben datos.' };
}
