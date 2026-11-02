import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { RecipientSuggestion } from '@/lib/types'

interface Result {
  items: RecipientSuggestion[]
  total: number
}

const EMPTY: Result = { items: [], total: 0 }
const cache = new Map<string, Result>()
const tokensOf = (q: string) => q.toLowerCase().split(/[^a-z0-9+']+/).filter(Boolean)

/** A cached shorter query whose full result set is known answers a longer one without a request. */
function fromCache(q: string): Result | null {
  const hit = cache.get(q)
  if (hit) return hit
  const tokens = tokensOf(q)
  for (let i = q.length - 1; i >= 1; i--) {
    const prev = cache.get(q.slice(0, i))
    if (!prev || prev.total > prev.items.length) continue
    const items = prev.items.filter((s) => {
      const hay = `${s.email} ${s.name ?? ''}`.toLowerCase()
      return tokens.every((t) => hay.includes(t))
    })
    // Nothing left locally: ask the server, which also tolerates typos.
    return items.length ? { items, total: items.length } : null
  }
  return null
}

export function clearRecipientCache(): void {
  cache.clear()
}

/** Debounced, abortable autocomplete for the text typed in a recipient field. */
export function useRecipientSuggestions(query: string, delay = 120) {
  const q = query.trim().toLowerCase()
  const searchable = tokensOf(q).length > 0
  const [fetched, setFetched] = useState<{ q: string; result: Result }>({ q: '', result: EMPTY })
  const local = searchable ? fromCache(q) : null
  const hasLocal = local !== null

  useEffect(() => {
    if (!searchable || hasLocal) return
    const ctl = new AbortController()
    const timer = window.setTimeout(() => {
      api.recipients(q, ctl.signal)
        .then((result) => {
          cache.set(q, result)
          if (cache.size > 200) cache.delete(cache.keys().next().value as string)
          setFetched({ q, result })
        })
        .catch((err: unknown) => {
          if ((err as Error).name !== 'AbortError') setFetched({ q, result: EMPTY })
        })
    }, delay)
    return () => {
      window.clearTimeout(timer)
      ctl.abort()
    }
  }, [q, searchable, hasLocal, delay])

  if (!searchable) return { ...EMPTY, loading: false, query: q }
  if (local) return { ...local, loading: false, query: q }
  // While a request is in flight keep showing the previous list, so the dropdown doesn't flicker.
  return { ...fetched.result, loading: fetched.q !== q, query: fetched.q }
}
