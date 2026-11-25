import { access, readFile } from 'node:fs/promises'
import type { ServerResponse } from 'node:http'
import { extname, resolve, sep } from 'node:path'

export interface Page {
  dist: string // the built page's directory
  unbuilt: string // what a request is told while dist is missing: how this host builds the page
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
}
// A directory, a path that runs through a file, or a name longer than a file's can be.
const NOT_A_FILE = new Set(['ENOENT', 'EISDIR', 'ENOTDIR', 'ENAMETOOLONG'])

// The page will render agents' reports, which it sanitises. This is the second line: no script but
// the page's own files, so index.html holds none inline, and nothing loaded from or sent to another
// origin. Inline styles and data: images stay allowed for the components that write them.
const PAGE_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

async function sendNotFound(
  root: string,
  unbuilt: string,
  res: ServerResponse,
): Promise<void> {
  const built = await access(root).then(
    () => true,
    () => false,
  )
  res.writeHead(built ? 404 : 503, {
    'Content-Type': 'text/plain; charset=utf-8',
  })
  res.end(built ? 'Not found' : unbuilt)
}

export async function serveStatic(
  { dist, unbuilt }: Page,
  pathname: string,
  res: ServerResponse,
): Promise<void> {
  const root = resolve(dist)
  const file = resolve(
    root,
    '.' + (pathname === '/' ? '/index.html' : pathname),
  )
  if (!file.startsWith(root + sep)) {
    await sendNotFound(root, unbuilt, res)
    return
  }
  let body: Buffer
  try {
    body = await readFile(file)
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException
    if (code !== undefined && NOT_A_FILE.has(code)) {
      await sendNotFound(root, unbuilt, res)
      return
    }
    // The error names the file by its absolute path: that goes to the log, not into the answer.
    console.error(error)
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end("The page's file couldn't be read")
    return
  }
  const type = CONTENT_TYPES[extname(file)] ?? 'application/octet-stream'
  if (type.startsWith('text/html')) {
    res.setHeader('Content-Security-Policy', PAGE_POLICY)
  }
  // Vite names what's under assets/ by its contents; everything else is asked for again on each
  // load, so a rebuilt page shows up without a hard reload.
  res.writeHead(200, {
    'Content-Type': type,
    'Cache-Control': pathname.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
  })
  res.end(body)
}
