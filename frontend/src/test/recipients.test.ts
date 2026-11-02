import { describe, expect, it } from 'vitest'
import { dedupe, highlight, isValidEmail, parseRecipient, parseRecipientList } from '@/lib/recipients'

describe('recipient parsing', () => {
  it('parses names, bare addresses and mailto', () => {
    expect(parseRecipient('Nanna Abhiram <Nanna.Abhiram@KLH.edu.in>')).toEqual({ email: 'nanna.abhiram@klh.edu.in', name: 'Nanna Abhiram' })
    expect(parseRecipient('"Priya, R" <priya@example.org>')).toEqual({ email: 'priya@example.org', name: 'Priya, R' })
    expect(parseRecipient('mailto:a@b.co')).toEqual({ email: 'a@b.co', name: null })
    expect(parseRecipient('  ,  ')).toBeNull()
  })

  it('splits pasted lists without breaking quoted names', () => {
    const list = parseRecipientList('"Priya, R" <priya@example.org>, b@y.com; c@z.com\nd@w.io e@v.io')
    expect(list.map((r) => r.email)).toEqual(['priya@example.org', 'b@y.com', 'c@z.com', 'd@w.io', 'e@v.io'])
  })

  it('validates and dedupes', () => {
    expect(isValidEmail('nanna.abhiram@klh.edu.in')).toBe(true)
    expect(isValidEmail('nanna.abhiram')).toBe(false)
    expect(dedupe([{ email: 'a@b.co', name: null }, { email: 'a@b.co', name: 'A' }])).toHaveLength(1)
  })

  it('highlights the matched token', () => {
    expect(highlight('nanna.abhiram@klh.edu.in', 'nanna.abh')).toEqual(['', 'nanna.abh', 'iram@klh.edu.in'])
    expect(highlight('Nanna Abhiram', 'nanna.abh')).toEqual(['', 'Nanna Abh', 'iram'])
    expect(highlight('Nanna Abhiram', 'abhi')).toEqual(['Nanna ', 'Abhi', 'ram'])
    expect(highlight('Nanna Abhiram', 'abhi nan')).toEqual(['Nanna ', 'Abhi', 'ram'])
  })
})
