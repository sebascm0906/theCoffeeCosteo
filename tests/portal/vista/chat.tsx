import { ChatPortal } from '../../../components/portal/chat';
const original = window.fetch.bind(window);
window.fetch = async (input, init) => {
  if (String(input) !== '/api/chat') return original(input, init);
  const partes = [
    { type: 'start', messageId: crypto.randomUUID() },
    { type: 'text-start', id: 'texto' },
    {
      type: 'text-delta',
      id: 'texto',
      delta:
        'Datos sintéticos para revisar la interfaz.\n\n| Producto | Costo | Canal |\n|---|---:|---|\n| Americano | $8.50 | Mostrador |\n| Latte | $12.00 | Mostrador |\n\n[Ver ficha](/productos/11111111-1111-4111-8111-111111111111)',
    },
    { type: 'text-end', id: 'texto' },
    { type: 'finish' },
  ];
  return new Response(partes.map((p) => `data: ${JSON.stringify(p)}\n\n`).join('') + 'data: [DONE]\n\n', {
    headers: { 'Content-Type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
  });
};
export function VistaChat() {
  return (
    <main className="p-6">
      <p className="aviso">
        PRUEBA VISUAL · DATOS SINTÉTICOS · Sin Auth ni conexión a bases de datos o Claude
      </p>
      <h1>Productos</h1>
      <ChatPortal />
    </main>
  );
}
