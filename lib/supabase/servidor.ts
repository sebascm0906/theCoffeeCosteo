import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './database.types';
import { configuracion } from './config';
export async function servidor() {
  const jar = await cookies();
  const { url, key } = configuracion();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (items) => {
        try {
          items.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {
          /* El proxy renueva cookies en Server Components. */
        }
      },
    },
  });
}
