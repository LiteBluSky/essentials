// Accent- and case-insensitive matching for every search box: "cancion"
// finds "Canción", "nino" finds "Niño". Pure, used in the browser and on
// the server.

/** Lower case without diacritics (é → e, ñ → n, Ü → u). */
export function fold(text: string) {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/** Whether `text` contains `query` (already folded), ignoring accents and
 * case. */
export function foldIncludes(text: string, query: string) {
  return fold(text).includes(query)
}

/** The accented letters SQL matches for a plain one (SQLite's `like` and
 * `lower` only know ASCII). */
const ACCENTED: Record<string, string> = {
  a: 'áàâäãåā',
  e: 'éèêëēė',
  i: 'íìîïī',
  o: 'óòôöõō',
  u: 'úùûüū',
  y: 'ýÿ',
  n: 'ñ',
  c: 'ç',
}

/** A SQLite `glob` pattern finding `word` (already folded) anywhere in a
 * text, ignoring case and accents: each letter becomes a class of its
 * forms (`n` → `[nNñÑ]`), glob's own `*`, `?` and `[` are matched
 * literally. */
export function foldGlob(word: string) {
  const part = (c: string) => {
    if ('*?['.includes(c)) return `[${c}]`
    const forms = new Set([c, c.toUpperCase()])
    for (const a of ACCENTED[c] ?? '') forms.add(a).add(a.toUpperCase())
    return forms.size > 1 ? `[${[...forms].join('')}]` : c
  }
  return `*${[...word].map(part).join('')}*`
}
