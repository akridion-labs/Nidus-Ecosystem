import postgres from 'postgres'

/**
 * One connection factory. Database-specific SQL lives in the repository layer
 * (server/db/repo.ts) so a later move off PostgreSQL is an explicit piece of
 * work rather than a changed connection string.
 */
export function connect(url = process.env.DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL is not set')
  return postgres(url, { max: 10, onnotice: () => {} })
}

export type Sql = ReturnType<typeof connect>
