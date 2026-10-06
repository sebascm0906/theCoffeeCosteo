import { emisorMcp, URL_MCP } from '@/lib/mcp/config';
export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json(
    {
      resource: URL_MCP,
      resource_name: 'The Coffee · Consultas',
      authorization_servers: [emisorMcp()],
      bearer_methods_supported: ['header'],
      scopes_supported: ['openid'],
    },
    {
      headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
    },
  );
}
export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' },
  });
}
