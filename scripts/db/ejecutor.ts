/** Lo mínimo que necesitan los scripts: PGlite y pg.Client lo cumplen. */
export interface Ejecutor {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}
