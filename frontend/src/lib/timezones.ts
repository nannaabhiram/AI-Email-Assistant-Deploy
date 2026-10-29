/**
 * Timezone choices for settings. Values are current IANA identifiers (what the backend's zoneinfo
 * stores and schedules with). Browsers build `Intl.supportedValuesOf('timeZone')` from CLDR, which
 * still uses legacy names such as `Asia/Calcutta` and leaves out `UTC`, so the raw list is normalised.
 */

/** CLDR legacy name -> current IANA name, for zones whose browser name differs. */
export const LEGACY_TIMEZONES: Record<string, string> = {
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Europe/Kiev': 'Europe/Kyiv',
  'America/Godthab': 'America/Nuuk',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'Pacific/Enderbury': 'Pacific/Kanton',
  'Pacific/Truk': 'Pacific/Chuuk',
  'Pacific/Ponape': 'Pacific/Pohnpei',
  'Africa/Asmera': 'Africa/Asmara',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'America/Catamarca': 'America/Argentina/Catamarca',
  'America/Cordoba': 'America/Argentina/Cordoba',
  'America/Jujuy': 'America/Argentina/Jujuy',
  'America/Mendoza': 'America/Argentina/Mendoza',
  'America/Indianapolis': 'America/Indiana/Indianapolis',
  'America/Louisville': 'America/Kentucky/Louisville',
  'America/Coral_Harbour': 'America/Atikokan',
}

const FALLBACK = ['UTC', 'Asia/Kolkata', 'Europe/London', 'America/New_York']

export function canonicalTimezone(tz: string): string {
  return LEGACY_TIMEZONES[tz] ?? tz
}

function browserTimezones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone')
  } catch {
    return FALLBACK
  }
}

/** "UTC+05:30" for the zone's current offset. */
export function utcOffset(tz: string, at: Date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(at).find((p) => p.type === 'timeZoneName')?.value
    return !part || part === 'GMT' ? 'UTC+00:00' : part.replace('GMT', 'UTC')
  } catch {
    return ''
  }
}

/** Sorted, de-duplicated IANA names; always includes UTC and the currently saved value. */
export function timezoneOptions(current?: string | null, source: string[] = browserTimezones()): { value: string; label: string }[] {
  const zones = new Set(source.map(canonicalTimezone))
  zones.add('UTC')
  if (current) zones.add(current)
  return [...zones].sort((a, b) => (a === 'UTC' ? -1 : b === 'UTC' ? 1 : a.localeCompare(b)))
    .map((tz) => {
      const offset = utcOffset(tz)
      return { value: tz, label: offset ? `${tz} (${offset})` : tz }
    })
}
