import { expect,it,vi,beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ user:vi.fn(),perfil:vi.fn(),redirect:vi.fn((path:string) => { throw new Error(`REDIRECT:${path}`); }) }));
vi.mock('../../lib/supabase/servidor',() => ({ servidor:async () => ({ auth:{ getUser:mocks.user },from:() => ({ select:() => ({ eq:() => ({ maybeSingle:mocks.perfil }) }) }) }) }));
vi.mock('next/navigation',() => ({ redirect:mocks.redirect }));
import { sesion } from '../../lib/supabase/sesion';
beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue({ data:{ user:{ id:'u' } },error:null }); mocks.perfil.mockResolvedValue({ data:{ user_id:'u',rol:'compras',activo:true },error:null }); });
it('verifica identidad antes de consultar datos y deniega sesión vencida', async () => { mocks.user.mockResolvedValue({ data:{ user:null },error:{ message:'expired' } }); await expect(sesion()).rejects.toThrow('REDIRECT:/login'); expect(mocks.perfil).not.toHaveBeenCalled(); });
it('deniega usuario sin perfil o inactivo', async () => { for (const perfil of [null,{ activo:false }]) { mocks.perfil.mockResolvedValue({ data:perfil,error:null }); await expect(sesion()).rejects.toThrow('aviso=perfil'); } });
it('rechaza escritura ajena, permite lectura y propaga errores de conexión', async () => { expect((await sesion()).perfil.rol).toBe('compras'); await expect(sesion('precios')).rejects.toThrow('permiso'); mocks.perfil.mockResolvedValue({ data:null,error:{ message:'red' } }); await expect(sesion()).rejects.toThrow('consultar tu perfil'); });
