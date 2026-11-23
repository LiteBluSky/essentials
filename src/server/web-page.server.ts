import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

// Server-only: Jarvis reading a web page (`read_url`): a URL the user pasted
// or a saved bookmark's. Only ever on the user's request (a Jarvis tool), so
// it's no background outside call. Fetched once, with no cookies, turned
// into plain text for the model. Addresses on this machine or the LAN are
// refused, so a page (or a prompt it contains) can't make the server probe
// the home network.

const TIMEOUT_MS = 15_000
const MAX_BYTES = 3_000_000
const MAX_TEXT_CHARS = 20_000
const MAX_LINKS = 40
const MAX_REDIRECTS = 5

export type WebPage = {
  url: string
  title: string
  description: string
  text: string
  links: Array<{ text: string; url: string }>
}

/** Loopback, private, link-local, CGNAT and other non-public addresses. */
function privateAddress(ip: string) {
  if (isIP(ip) === 6) {
    const v6 = ip.toLowerCase()
    const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
    if (mapped) return privateAddress(mapped[1])
    return (
      v6 === '::' ||
      v6 === '::1' ||
      v6.startsWith('fc') ||
      v6.startsWith('fd') ||
      /^fe[89ab]/.test(v6)
    )
  }
  const [a, b] = ip.split('.').map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  )
}

async function assertPublic(url: URL) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new Error('Only http(s) pages can be read')
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local')
  )
    throw new Error('Pages on this machine or the local network are not read')
  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true })).map((a) => a.address)
  if (!addresses.length || addresses.some(privateAddress))
    throw new Error('Pages on this machine or the local network are not read')
}

/** The body as text, at most MAX_BYTES of it. */
async function readCapped(res: Response) {
  if (!res.body) return ''
  const reader = res.body.getReader()
  const chunks: Array<Uint8Array> = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    size += value.byteLength
    if (size >= MAX_BYTES) {
      await reader.cancel()
      break
    }
  }
  const charset = /charset=([\w-]+)/i.exec(
    res.headers.get('content-type') ?? '',
  )?.[1]
  let decoder: TextDecoder
  try {
    decoder = new TextDecoder(charset ?? 'utf-8')
  } catch {
    decoder = new TextDecoder('utf-8')
  }
  return decoder.decode(Buffer.concat(chunks))
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  euro: '€',
  copy: '©',
}

function decode(text: string) {
  return text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n =
        code[1] === 'x' || code[1] === 'X'
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000
        ? String.fromCodePoint(n)
        : whole
    }
    return ENTITIES[code.toLowerCase()] ?? whole
  })
}

const clean = (text: string) => decode(text).replace(/\s+/g, ' ').trim()

/** Title, description, readable text and links of an HTML page. */
export function htmlToPage(html: string, base: URL): Omit<WebPage, 'url'> {
  const title = clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '')
  const meta = (name: string) =>
    new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, 'i').exec(
      html,
    )?.[0]
  const metaTag = meta('description') ?? meta('og:description') ?? ''
  const description = clean(
    /content=["']([^"']*)["']/i.exec(metaTag)?.[1] ?? '',
  )

  let body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(
      /<(script|style|noscript|svg|template|iframe|head|nav|footer|form|select)\b[\s\S]*?<\/\1>/gi,
      ' ',
    )

  const links: WebPage['links'] = []
  const seen = new Set<string>()
  for (const m of body.matchAll(
    /<a\b[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    if (links.length >= MAX_LINKS) break
    const text = clean(m[2].replace(/<[^>]+>/g, ' '))
    let href: string
    try {
      href = new URL(decode(m[1]), base).href
    } catch {
      continue
    }
    if (!text || !/^https?:/.test(href) || seen.has(href)) continue
    seen.add(href)
    links.push({ text: text.slice(0, 120), url: href })
  }

  body = body
    .replace(/<(h[1-6])\b[^>]*>/gi, '\n\n## ')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(
      /<\/?(p|div|section|article|main|header|aside|ul|ol|table|tr|blockquote|pre|h[1-6]|dl|dt|dd|figure|figcaption)\b[^>]*>/gi,
      '\n',
    )
    .replace(/<(td|th)\b[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
  const text = decode(body)
    .split('\n')
    // Lines hold no newline any more, so \s is just the spaces (nbsp too).
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line, i, lines) => line || (i > 0 && lines[i - 1]))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { title, description, text, links }
}

/** Fetch `raw` and return it as text for the model. Throws a readable
 * error (bad URL, a local address, not a page, HTTP error, timeout). */
export async function readWebPage(raw: string): Promise<WebPage> {
  let url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  let res: Response | undefined
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url)
    res = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'user-agent':
          'Mozilla/5.0 (compatible; personal-assistant page reader)',
        accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
      },
    })
    const location = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel()
      url = new URL(location, url)
      continue
    }
    break
  }
  if (!res || (res.status >= 300 && res.status < 400))
    throw new Error('Too many redirects')
  if (!res.ok) {
    await res.body?.cancel()
    throw new Error(`The site answered ${res.status} ${res.statusText}`.trim())
  }
  const type = (res.headers.get('content-type') ?? '').toLowerCase()
  const body = await readCapped(res)
  const cut = (text: string) =>
    text.length > MAX_TEXT_CHARS
      ? `${text.slice(0, MAX_TEXT_CHARS)}… (cut short)`
      : text
  if (type.includes('html') || (!type && /<html|<body/i.test(body))) {
    const page = htmlToPage(body, url)
    return { url: url.href, ...page, text: cut(page.text) }
  }
  if (
    type.startsWith('text/') ||
    type.includes('json') ||
    type.includes('xml')
  ) {
    return {
      url: url.href,
      title: '',
      description: '',
      text: cut(body),
      links: [],
    }
  }
  throw new Error(
    `Not a page that can be read as text (${type.split(';')[0] || 'unknown type'})`,
  )
}
