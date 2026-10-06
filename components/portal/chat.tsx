'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MessageCircle, X, Send, Square, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { enlacePortal, MAX_TURNOS } from '@/lib/chat/entrada';

const transport = new DefaultChatTransport({
  api: '/api/chat',
  prepareSendMessagesRequest: ({ messages }) => ({
    body: {
      messages: messages
        .map(({ role, parts }) => ({
          role,
          parts: parts.filter((p) => p.type === 'text').map((p) => ({ type: 'text', text: p.text })),
        }))
        .filter((m) => m.parts.length),
    },
  }),
  fetch: async (input, init) => {
    const r = await fetch(input, init);
    if (!r.ok) {
      const body = await r.json().catch(() => null);
      throw new Error(body?.error || 'No se pudo conectar con el asistente.');
    }
    return r;
  },
});
const sugerencias = [
  '¿Qué productos tienen alertas?',
  'Consulta los costos del Americano',
  'Busca insumos de café',
];

export function ChatPortal() {
  const [abierto, setAbierto] = useState(false);
  const [entrada, setEntrada] = useState('');
  const { messages, sendMessage, status, error, stop, setMessages, clearError } = useChat({ transport });
  const ocupado = status === 'submitted' || status === 'streaming';
  const turnos = messages.filter((m) => m.role === 'user').length;
  const limite = turnos >= MAX_TURNOS;
  const campo = useRef<HTMLTextAreaElement>(null);
  const lanzador = useRef<HTMLButtonElement>(null);
  const fondo = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (abierto) campo.current?.focus();
  }, [abierto]);
  useEffect(() => {
    if (abierto) fondo.current?.scrollIntoView({ block: 'nearest' });
  }, [abierto, messages, status]);
  const cerrar = () => {
    setAbierto(false);
    lanzador.current?.focus();
  };
  const enviar = (texto: string) => {
    if (!texto.trim() || ocupado || limite) return;
    clearError();
    setEntrada('');
    void sendMessage({ text: texto.trim() });
  };
  return (
    <div className="fixed bottom-4 right-4 z-50 print:hidden">
      {abierto && (
        <section
          role="dialog"
          aria-labelledby="chat-titulo"
          onKeyDown={(e) => {
            if (e.key === 'Escape') cerrar();
          }}
          className="mb-3 flex h-[min(680px,calc(100dvh-100px))] w-[min(480px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl"
        >
          <header className="flex items-center justify-between gap-3 border-b p-4">
            <div>
              <h2 id="chat-titulo" className="font-semibold">
                Asistente The Coffee
              </h2>
              <p className="text-xs text-neutral-500">Consultas de costos y recetas · Claude</p>
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Nueva conversación"
                disabled={ocupado || !messages.length}
                onClick={() => {
                  setMessages([]);
                  clearError();
                  setEntrada('');
                  campo.current?.focus();
                }}
              >
                <Plus size={18} />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Cerrar asistente" onClick={cerrar}>
                <X size={18} />
              </Button>
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4" aria-label="Conversación">
            {!messages.length && (
              <div className="space-y-4 py-4">
                <p className="text-sm text-neutral-600">
                  Pregunta por ingredientes, costos, márgenes o alertas. El asistente consulta los datos del
                  portal.
                </p>
                <div className="flex flex-col gap-2">
                  {sugerencias.map((s) => (
                    <button
                      key={s}
                      onClick={() => enviar(s)}
                      className="rounded-xl border p-3 text-left text-sm hover:bg-neutral-50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-neutral-500">
                  Solo lectura. Las consultas se procesan con Claude. Verifica las cifras en la ficha del
                  producto.
                </p>
              </div>
            )}
            {messages.map((m) => (
              <article
                key={m.id}
                className={m.role === 'user' ? 'ml-8 rounded-xl bg-neutral-100 p-3' : 'mr-2'}
              >
                <p className="mb-1 text-xs font-semibold text-neutral-500">
                  {m.role === 'user' ? 'Tú' : 'The Coffee'}
                </p>
                {m.parts.map((p, i) =>
                  p.type === 'text' ? (
                    <div className="chat-respuesta text-sm" key={i}>
                      <Markdown
                        remarkPlugins={[remarkGfm]}
                        skipHtml
                        urlTransform={(url) => enlacePortal(url) || ''}
                        components={{
                          img: () => null,
                          a: ({ href, children }) =>
                            enlacePortal(href) ? (
                              <a href={href} className="underline font-medium">
                                {children}
                              </a>
                            ) : (
                              <span>{children}</span>
                            ),
                          table: ({ children }) => (
                            <div className="overflow-x-auto">
                              <table>{children}</table>
                            </div>
                          ),
                        }}
                      >
                        {p.text}
                      </Markdown>
                    </div>
                  ) : p.type.startsWith('tool-') &&
                    'state' in p &&
                    (p.state === 'input-available' || p.state === 'input-streaming') ? (
                    <p key={i} className="text-xs text-neutral-500">
                      Consultando datos…
                    </p>
                  ) : null,
                )}
              </article>
            ))}
            {ocupado && (
              <p role="status" className="text-xs text-neutral-500">
                {status === 'submitted' ? 'Buscando la información…' : 'Preparando respuesta…'}
              </p>
            )}
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
                {error.message}
              </p>
            )}
            {limite && !ocupado && (
              <p role="status" className="text-sm">
                Inicia una nueva conversación para seguir consultando.
              </p>
            )}
            <div ref={fondo} />
          </div>
          <form
            className="border-t p-3"
            onSubmit={(e) => {
              e.preventDefault();
              enviar(entrada);
            }}
          >
            <label className="sr-only" htmlFor="chat-pregunta">
              Tu consulta
            </label>
            <textarea
              id="chat-pregunta"
              ref={campo}
              value={entrada}
              onChange={(e) => setEntrada(e.target.value)}
              maxLength={2000}
              rows={2}
              disabled={ocupado || limite}
              placeholder="Pregunta sobre tus costos…"
              className="w-full resize-none rounded-xl border p-3 text-sm disabled:opacity-60"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  enviar(entrada);
                }
              }}
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-xs text-neutral-500">
                {turnos}/{MAX_TURNOS} consultas · Historial temporal
              </p>
              {ocupado ? (
                <Button type="button" size="sm" onClick={() => void stop()}>
                  <Square size={14} /> Detener
                </Button>
              ) : (
                <Button type="submit" size="sm" disabled={!entrada.trim() || limite}>
                  <Send size={14} /> Enviar
                </Button>
              )}
            </div>
          </form>
        </section>
      )}
      <Button
        ref={lanzador}
        onClick={() => (abierto ? cerrar() : setAbierto(true))}
        aria-expanded={abierto}
        className="float-right rounded-full shadow-lg"
      >
        <MessageCircle size={18} /> Consultar
      </Button>
    </div>
  );
}
