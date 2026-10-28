export interface DiffPart {
  type: 'same' | 'added' | 'removed'
  text: string
}

/** Word-level LCS diff, bounded for responsiveness. */
export function diffWords(before: string, after: string, maxTokens = 1500): DiffPart[] {
  const a = before.split(/(\s+)/).slice(0, maxTokens)
  const b = after.split(/(\s+)/).slice(0, maxTokens)
  const n = a.length
  const m = b.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
    }
  }
  const out: DiffPart[] = []
  const push = (type: DiffPart['type'], text: string) => {
    const last = out[out.length - 1]
    if (last && last.type === type) last.text += text
    else out.push({ type, text })
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) { push('same', a[i]!); i++; j++ }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) { push('removed', a[i]!); i++ }
    else { push('added', b[j]!); j++ }
  }
  while (i < n) push('removed', a[i++]!)
  while (j < m) push('added', b[j++]!)
  return out
}
