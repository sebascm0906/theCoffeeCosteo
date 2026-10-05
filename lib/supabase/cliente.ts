'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';
import { configuracion } from './config';
export function cliente() { const { url, key } = configuracion(); return createBrowserClient<Database>(url, key); }
