const callbacks = ['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback'];
export function retornoClaude(valor: string) {
  const url = new URL(valor);
  if (url.username || url.password || url.hash || !callbacks.includes(`${url.origin}${url.pathname}`)) {
    throw new Error('La solicitud no pertenece a un conector de Claude permitido.');
  }
  return url.toString();
}
export function idAutorizacion(valor: unknown): string {
  if (typeof valor !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(valor))
    throw new Error('Solicitud de autorización inválida.');
  return valor;
}
