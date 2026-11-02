/** Address parsing for the compose window: "Name <a@b.c>", bare addresses, pasted lists. */
export interface Recipient {
  email: string
  name: string | null
}

const EMAIL_RE = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/

export function isValidEmail(email: string): boolean {
  return email.length <= 320 && EMAIL_RE.test(email)
}

export function parseRecipient(raw: string): Recipient | null {
  const text = raw.trim().replace(/^[,;]+|[,;]+$/g, '').trim()
  if (!text) return null
  const angled = /^(.*?)<([^<>]+)>$/.exec(text)
  if (angled) {
    const name = (angled[1] ?? '').trim().replace(/^"|"$/g, '').trim()
    return { email: (angled[2] ?? '').trim().toLowerCase(), name: name || null }
  }
  return { email: text.replace(/^mailto:/i, '').toLowerCase(), name: null }
}

/** Splits pasted text such as `"A" <a@x.com>, b@y.com; c@z.com` into recipients. */
export function parseRecipientList(text: string): Recipient[] {
  const parts: string[] = []
  let current = ''
  let quoted = false
  let angled = false
  for (const ch of text) {
    if (ch === '"') quoted = !quoted
    else if (ch === '<') angled = true
    else if (ch === '>') angled = false
    if (!quoted && !angled && (ch === ',' || ch === ';' || ch === '\n')) {
      parts.push(current)
      current = ''
    } else current += ch
  }
  parts.push(current)
  return parts.flatMap((p) => {
    const trimmed = p.trim()
    if (!trimmed) return []
    // "a@x.com b@y.com" (space separated, no names)
    if (!trimmed.includes('<') && /\s/.test(trimmed) && trimmed.split(/\s+/).every((w) => w.includes('@'))) {
      return trimmed.split(/\s+/).map((w) => parseRecipient(w)).filter((r): r is Recipient => r !== null)
    }
    const r = parseRecipient(trimmed)
    return r ? [r] : []
  })
}

export function formatRecipient(r: Recipient): string {
  return r.name ? `"${r.name.replace(/"/g, '')}" <${r.email}>` : r.email
}

export function dedupe(list: Recipient[]): Recipient[] {
  const seen = new Set<string>()
  return list.filter((r) => (seen.has(r.email) ? false : (seen.add(r.email), true)))
}

/** Splits `label` into [before, match, after] around what the user typed ("nanna.ab" matches "Nanna Ab…" too). */
export function highlight(label: string, query: string): [string, string, string] {
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9+']/g, ' ')
  const hay = norm(label)
  const whole = norm(query).trim()
  const at = whole ? hay.indexOf(whole) : -1
  if (at >= 0) return [label.slice(0, at), label.slice(at, at + whole.length), label.slice(at + whole.length)]
  const tokens = whole.split(/\s+/).filter(Boolean).sort((x, y) => y.length - x.length)
  for (const t of tokens) {
    const i = hay.indexOf(t)
    if (i >= 0) return [label.slice(0, i), label.slice(i, i + t.length), label.slice(i + t.length)]
  }
  return [label, '', '']
}
