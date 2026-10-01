// Minimal parameter-binding helper shared by the query builders.
//
// The point is that a value can only ever reach SQL as a bound parameter, and
// that the placeholder numbering is owned by one place instead of being
// hand-maintained per builder. Every fragment builder (txn-sql, wht-sql) uses
// this, so adding a filter can never renumber another filter's placeholders by
// accident.

export interface Builder {
  params: unknown[]
  /** Bind a value and return its `$n` placeholder. */
  bind: (v: unknown) => string
}

export interface SqlFragment {
  text: string
  params: unknown[]
}

export function makeBuilder(seed: unknown[] = []): Builder {
  const params = [...seed]
  return {
    params,
    bind: (v: unknown) => {
      params.push(v)
      return `$${params.length}`
    },
  }
}

/** `n` bound placeholders: bind(1), bind(2) … returns "($1, $2)". */
export function bindIn(b: Builder, values: unknown[]): string {
  return `(${values.map((v) => b.bind(v)).join(', ')})`
}

export function andJoin(parts: string[]): string {
  return parts.join('\n    and ')
}

/**
 * ILIKE needle with the wildcards escaped, so a literal % or _ in a search box
 * matches itself instead of turning into "match everything".
 */
export function likeNeedle(q: string): string {
  return `%${q.replace(/([\\%_])/g, '\\$1')}%`
}

export const LIKE_ESCAPE = `escape '\\'`
