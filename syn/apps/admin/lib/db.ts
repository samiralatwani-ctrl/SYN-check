import 'server-only';
import postgres from 'postgres';

const g = globalThis as unknown as { __synSql?: ReturnType<typeof postgres> };
export const sql = g.__synSql ?? postgres(process.env.DATABASE_URL!, { max: 5, prepare: false });
if (process.env.NODE_ENV !== 'production') g.__synSql = sql;
