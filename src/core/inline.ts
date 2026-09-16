// Turns an unpacked KaiOS package into a single self-contained document.
//
// KaiOS apps are small web apps; their index.html plus its scripts, styles and
// images can be folded into one page. Doing that means the same runtime works
// on web (iframe srcDoc) and on Android (WebView source.html) with no local
// server and no CORS, which is what a phone needs.

import { decodeUtf8, encodeBase64 } from './bytes';

const TEXT_EXT = new Set(['.js', '.mjs', '.css', '.svg', '.json', '.txt', '.webapp']);

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
};

const decode = decodeUtf8;

function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot).toLowerCase();
}

/** Resolve a relative reference against the directory of `from`. */
export function resolvePath(from: string, ref: string): string {
  if (/^([a-z]+:)?\/\//i.test(ref) || ref.startsWith('data:') || ref.startsWith('blob:')) return ref;
  const baseDir = from.includes('/') ? from.slice(0, from.lastIndexOf('/') + 1) : '';
  const raw = ref.startsWith('/') ? ref.slice(1) : baseDir + ref;
  const parts: string[] = [];
  for (const seg of raw.split('/')) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

function dataUri(path: string, bytes: Uint8Array): string {
  const mime = MIME[extOf(path)] ?? 'application/octet-stream';
  return `data:${mime};base64,${encodeBase64(bytes)}`;
}

function findFile(files: Record<string, Uint8Array>, path: string): Uint8Array | null {
  if (files[path]) return files[path];
  const alt = Object.keys(files).find((k) => k === path || k.endsWith('/' + path));
  return alt ? files[alt] : null;
}

/**
 * Build a self-contained HTML document for an app.
 *
 * `entry` is the launch path from the manifest. The app's own `<script src>`,
 * `<link rel=stylesheet>` and `<img src>` references are inlined when the
 * referenced file is inside the package; everything remote is left alone.
 */
export function buildAppDocument(entry: string, files: Record<string, Uint8Array>): string {
  const entryPath = files[entry] ? entry : Object.keys(files).find((k) => k === 'index.html' || k.endsWith('/index.html')) ?? entry;
  const entryBytes = findFile(files, entryPath);
  if (!entryBytes) {
    return '<!doctype html><meta charset="utf-8"><body style="background:#0e1420;color:#dce8f5;font:13px system-ui;padding:12px">'
      + '<h1>package did not contain an entry document</h1>'
      + '<p>The descriptor booted but there was no HTML inside application.zip.</p></body>';
  }

  let html = decode(entryBytes);

  html = html.replace(/<script\b([^>]*?)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (whole, pre, src, post) => {
    const p = resolvePath(entryPath, src);
    const body = findFile(files, p);
    if (!body) return whole;
    return `<script${pre}${post}>${decode(body).replace(/<\/script>/gi, '<\\/script>')}</script>`;
  });

  html = html.replace(/<link\b([^>]*)\bhref\s*=\s*["']([^"']+)["']([^>]*)>/gi, (whole, pre, href, post) => {
    if (!/stylesheet/i.test(pre + post)) return whole;
    const p = resolvePath(entryPath, href);
    const body = findFile(files, p);
    if (!body) return whole;
    return `<style>${decode(body)}</style>`;
  });

  html = html.replace(/(<img\b[^>]*?\bsrc\s*=\s*["'])([^"']+)(["'])/gi, (whole, pre, src, post) => {
    const p = resolvePath(entryPath, src);
    const body = findFile(files, p);
    if (!body) return whole;
    return `${pre}${dataUri(p, body)}${post}`;
  });

  html = html.replace(/url\(\s*["']?([^"')]+)["']?\s*\)/gi, (whole, ref) => {
    const p = resolvePath(entryPath, ref);
    const body = findFile(files, p);
    if (!body || TEXT_EXT.has(extOf(p))) return whole;
    return `url(${dataUri(p, body)})`;
  });

  return html;
}
