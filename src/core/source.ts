import JSZip from 'jszip';
import type { AppManifest, FetchedApp } from './types';
import { DEMO_APPLICATION_ZIP_B64, DEMO_UPDATE_WEBAPP } from './generated';
import { decodeBase64, decodeUtf8 } from './bytes';

export class CapabilityRejected extends Error {}

/** Turn any of the shapes a dump URL comes in into fetchable raw paths. */
export function parseSourceUrl(input: string): { kind: 'gitlab' | 'http' | 'bundled'; rawBase?: string; label: string } {
  const trimmed = input.trim();
  if (!trimmed || trimmed === 'demo' || trimmed === 'bundled') {
    return { kind: 'bundled', label: 'bundled demo app' };
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error('only http(s) URLs or the bundled demo are supported on device');
  }
  const url = new URL(trimmed);
  const tree = url.pathname.match(/^(.*?)\/-\/tree\/([^/]+)\/(.*)$/);
  if (tree) {
    const [, project, ref, sub] = tree;
    const base = sub.replace(/\/$/, '');
    return {
      kind: 'gitlab',
      rawBase: `${url.origin}${project}/-/raw/${ref}/${base}`,
      label: `${project.replace(/^\//, '')} @ ${ref.slice(0, 24)}…/${base.split('/').pop()}`,
    };
  }
  const raw = url.pathname.match(/^(.*?)\/-\/raw\/([^/]+)\/(.*)$/);
  if (raw) {
    const [, project, ref, sub] = raw;
    const withoutFile = sub.replace(/\/(update\.webapp|manifest\.webapp|application\.zip)$/, '');
    return {
      kind: 'gitlab',
      rawBase: `${url.origin}${project}/-/raw/${ref}/${withoutFile}`,
      label: `${project.replace(/^\//, '')}@${ref.slice(0, 16)}…`,
    };
  }
  const base = url.href.replace(/\/(update\.webapp|manifest\.webapp|application\.zip)$/, '');
  return { kind: 'http', rawBase: base, label: url.host };
}

async function fetchBytes(url: string, retries = 3, timeoutMs = 60000): Promise<Uint8Array> {
  let last: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      if (!buf.byteLength) throw new Error('empty response');
      return new Uint8Array(buf);
    } catch (err) {
      last = err;
      await new Promise((r) => setTimeout(r, 350 * attempt));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`could not fetch ${url}: ${(last as Error)?.message ?? last}`);
}

const decode = decodeUtf8;

export function normaliseManifest(raw: Record<string, unknown>): AppManifest {
  const permissions = (raw.permissions && typeof raw.permissions === 'object' ? raw.permissions : {}) as Record<string, unknown>;
  return {
    name: String(raw.name ?? raw.display ?? 'unnamed'),
    display: String(raw.display ?? raw.name ?? 'unnamed'),
    version: raw.version ? String(raw.version) : null,
    origin: raw.origin ? String(raw.origin) : null,
    launchPath: String(raw.launch_path ?? 'index.html'),
    permissions,
    permissionNames: Object.keys(permissions),
    raw,
  };
}

export function parseManifestText(text: string): AppManifest {
  const stripped = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/,\s*([}\]])/g, '$1');
  return normaliseManifest(JSON.parse(stripped));
}

export async function bundledDemo(): Promise<FetchedApp> {
  return {
    manifestText: DEMO_UPDATE_WEBAPP,
    files: await unzip(decodeBase64(DEMO_APPLICATION_ZIP_B64)),
    hasArchive: true,
    sourceLabel: 'bundled demo app',
  };
}

export async function fetchApp(input: string): Promise<FetchedApp> {
  const src = parseSourceUrl(input);

  if (src.kind === 'bundled') return bundledDemo();

  const base = src.rawBase!;
  let manifestBytes: Uint8Array | null = null;
  for (const name of ['update.webapp', 'manifest.webapp']) {
    try {
      manifestBytes = await fetchBytes(`${base}/${name}`);
      break;
    } catch {
      /* try the next name */
    }
  }
  if (!manifestBytes) throw new Error(`no update.webapp or manifest.webapp under ${base}`);
  const manifestText = decode(manifestBytes);

  let zipBytes: Uint8Array | null = null;
  try {
    zipBytes = await fetchBytes(`${base}/application.zip`, 3, 180000);
  } catch {
    zipBytes = null;
  }

  return {
    manifestText,
    files: zipBytes ? await unzip(zipBytes) : {},
    hasArchive: !!zipBytes,
    sourceLabel: src.label,
  };
}

export async function unzip(bytes: Uint8Array): Promise<Record<string, Uint8Array>> {
  const zip = await JSZip.loadAsync(bytes);
  const files: Record<string, Uint8Array> = {};
  const names = Object.keys(zip.files);
  for (const name of names) {
    const entry = zip.files[name];
    if (entry.dir) continue;
    files[name.replace(/^\/+/, '')] = await entry.async('uint8array');
  }
  return files;
}
