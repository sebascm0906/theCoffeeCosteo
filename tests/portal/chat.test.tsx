import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  send: vi.fn(),
  stop: vi.fn(),
  reset: vi.fn(),
  clear: vi.fn(),
  status: 'ready',
  messages: [] as { id: string; role: string; parts: { type: string; text: string }[] }[],
  error: undefined as Error | undefined,
}));
vi.mock('@ai-sdk/react', () => ({
  useChat: () => ({
    messages: m.messages,
    status: m.status,
    error: m.error,
    sendMessage: m.send,
    stop: m.stop,
    setMessages: m.reset,
    clearError: m.clear,
  }),
}));
import { ChatPortal } from '../../components/portal/chat';
beforeEach(() => {
  vi.clearAllMocks();
  m.messages = [];
  m.status = 'ready';
  m.error = undefined;
});
it('abre con foco, envía una pregunta y cierra con Escape sin perder el foco', async () => {
  render(<ChatPortal />);
  const abrir = screen.getByRole('button', { name: 'Consultar' });
  await userEvent.click(abrir);
  const campo = screen.getByRole('textbox', { name: 'Tu consulta' });
  expect(campo).toHaveFocus();
  await userEvent.type(campo, 'Costos del café{Enter}');
  expect(m.send).toHaveBeenCalledWith({ text: 'Costos del café' });
  await userEvent.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(abrir).toHaveFocus();
});
it('muestra tablas y enlaces internos, elimina scripts, imágenes y enlaces externos', async () => {
  m.messages = [
    {
      id: '1',
      role: 'assistant',
      parts: [
        {
          type: 'text',
          text: '| Producto | Costo |\n|---|---|\n| Café | $10 |\n\n[Ficha](/productos/11111111-1111-4111-8111-111111111111) [Fuera](https://externo.com) ![imagen](https://externo.com/a.png) <script>alert(1)</script>',
        },
      ],
    },
  ];
  render(<ChatPortal />);
  await userEvent.click(screen.getByRole('button', { name: 'Consultar' }));
  expect(screen.getByRole('table')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Ficha' })).toHaveAttribute(
    'href',
    '/productos/11111111-1111-4111-8111-111111111111',
  );
  expect(screen.queryByRole('link', { name: 'Fuera' })).not.toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Nueva conversación' }));
  expect(m.reset).toHaveBeenCalledWith([]);
});
it('permite detener la respuesta y bloquea envíos simultáneos', async () => {
  m.status = 'streaming';
  render(<ChatPortal />);
  await userEvent.click(screen.getByRole('button', { name: 'Consultar' }));
  expect(screen.getByRole('textbox')).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Detener' }));
  expect(m.stop).toHaveBeenCalled();
  expect(m.send).not.toHaveBeenCalled();
});
it('muestra errores y exige una conversación nueva tras doce consultas', async () => {
  m.messages = Array.from({ length: 12 }, (_, i) => ({
    id: String(i),
    role: 'user',
    parts: [{ type: 'text', text: 'consulta' }],
  }));
  m.error = new Error('Alcanzaste el límite de consultas.');
  render(<ChatPortal />);
  await userEvent.click(screen.getByRole('button', { name: 'Consultar' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Alcanzaste el límite');
  expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
});
