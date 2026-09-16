#!/usr/bin/env node
// Boots the exported web build of the Sandbox in a real engine, drives it
// through the bundled demo, records the screen and checks the evidence.
//
//   node scripts/verify-web.mjs
//
// Writes out/sandbox-verification.json, a screenshot series and recordings.
// This is the Sandbox's internal check: if it says pass, the UI, the gate, the
// runtime document and the summary table all worked in one run.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(root, 'dist');
const out = path.join(root, 'out');

if (!fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('verify-web: no dist/index.html — run `npm run export:web` first');
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'screen'), { recursive: true });

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2',
};

function collect(dir, base = '') {
  const files = new Map();
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = `${base}${entry.name}`;
    if (entry.isDirectory()) for (const [k, v] of collect(path.join(dir, entry.name), `${rel}/`)) files.set(k, v);
    else files.set(rel, fs.readFileSync(path.join(dir, entry.name)));
  }
  return files;
}

const mimeFor = (name) => MIME[name.slice(name.lastIndexOf('.'))] ?? 'application/octet-stream';

const steps = [];
let failed = 0;
const step = (name, ok, detail) => {
  steps.push({ name, ok: !!ok, detail: detail ?? null });
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const files = collect(dist);
step('export.assets', files.has('index.html'), `${files.size} files served`);

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
});

const context = await browser.newContext({
  viewport: { width: 420, height: 880 },
  deviceScaleFactor: 2,
  recordVideo: { dir: path.join(out, 'screen'), size: { width: 420, height: 880 } },
});

await context.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  const key = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  const body = files.get(key);
  if (!body) {
    await route.fulfill({ status: 404, contentType: 'text/plain', body: 'kailarp-sandbox: not found' });
    return;
  }
  await route.fulfill({ status: 200, contentType: mimeFor(key), body });
});

const page = await context.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e.message || e)));

await page.goto('http://localhost/index.html', { waitUntil: 'load', timeout: 30000 });
step('sandbox.title', (await page.getByText('KaiLARP Sandbox').count()) > 0, 'app shell rendered');

await page.getByText('bundled demo').click();
await page.getByText('KaiLARP Demo ran').waitFor({ timeout: 30000 }).catch(() => {});
step('sandbox.demo-ran', (await page.getByText('KaiLARP Demo ran').count()) > 0, 'the summary panel appeared');

const bodyText = await page.evaluate(() => document.body.innerText);
const probeRows = [...bodyText.matchAll(/^(ok|FAIL)\n([a-z][\w.]*)\n?(.*)$/gm)].map((m) => ({ ok: m[1] === 'ok', name: m[2], detail: m[3] }));
step('summary.probe-table', probeRows.length >= 15, `${probeRows.length} probe rows in the summary`);
step('summary.no-failures', probeRows.every((r) => r.ok), probeRows.filter((r) => !r.ok).map((r) => r.name).join(', ') || 'all ok');
step('summary.capability-notes', /spoof/.test(bodyText) && /native/.test(bodyText), 'capability notes present in the table');
step('sandbox.no-console-errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | ') || 'clean');

await page.screenshot({ path: path.join(out, 'sandbox-summary.png'), fullPage: true });
await page.waitForTimeout(600);

const video = page.video();
await context.close();
await browser.close();

let videoPath = null;
let probe = null;
if (video) {
  const produced = await video.path();
  if (produced && fs.existsSync(produced)) {
    videoPath = path.join(out, 'screen', 'sandbox.webm');
    fs.copyFileSync(produced, videoPath);
    probe = probeVideo(videoPath);
  }
}
step('recording.exists', !!videoPath && probe.bytes > 2048, `${probe?.bytes ?? 0} bytes`);
step('recording.shows-content', !!probe && probe.frames > 0 && probe.nonBlank, `frames=${probe?.frames} meanLuma=${probe?.meanLuma?.toFixed?.(1)}`);

const wide = path.join(out, 'screen', 'sandbox-16x9-240p.mp4');
if (videoPath) {
  transcode(videoPath, wide, '-2:240', '426:240:(426-iw)/2:(240-ih)/2:color=black');
  const p = probeVideo(wide);
  step('recording.16x9', p.frames > 0 && p.nonBlank, `frames=${p.frames}`);
}

const summary = {
  generatedAt: new Date().toISOString(),
  host: { node: process.version, platform: `${process.platform}/${process.arch}` },
  steps,
  probeRows,
  video: videoPath,
  videoProbe: probe,
  ok: failed === 0,
};
fs.writeFileSync(path.join(out, 'sandbox-verification.json'), JSON.stringify(summary, null, 2) + '\n');
fs.writeFileSync(
  path.join(out, 'sandbox-verification.md'),
  ['# KaiLARP-Sandbox verification', '', `Run at ${summary.generatedAt}.`, '', summary.ok ? '**ALL CHECKS PASSED**' : `**${failed} CHECK(S) FAILED**`, '',
    '| check | result | detail |', '| --- | --- | --- |',
    ...steps.map((s) => `| ${s.name} | ${s.ok ? 'pass' : 'FAIL'} | ${(s.detail ?? '').replace(/\|/g, '\\|')} |`), '',
    '| probe | result | note |', '| --- | --- | --- |',
    ...probeRows.map((r) => `| ${r.name} | ${r.ok ? 'pass' : 'FAIL'} | ${(r.detail ?? '').replace(/\|/g, '\\|')} |`), ''].join('\n'),
);

console.log(`\n${summary.ok ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`}`);
console.log(`  json: ${path.relative(root, path.join(out, 'sandbox-verification.json'))}`);
process.exit(summary.ok ? 0 : 1);

function probeVideo(file) {
  const bytes = fs.statSync(file).size;
  const ff = which('ffmpeg');
  if (!ff) return { bytes, frames: 0, nonBlank: false, note: 'ffmpeg missing' };
  const r = spawnSync(ff, ['-v', 'error', '-i', file, '-vf', 'signalstats,metadata=print:file=-', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const luma = [...(r.stdout || '').matchAll(/lavfi\.signalstats\.YAVG=([0-9.]+)/g)].map((m) => Number(m[1]));
  return {
    bytes,
    frames: luma.length,
    meanLuma: luma.length ? luma.reduce((a, b) => a + b, 0) / luma.length : null,
    nonBlank: luma.some((v) => v > 4),
  };
}

function transcode(input, dest, scale, pad) {
  const ff = which('ffmpeg');
  if (!ff) return dest;
  spawnSync(ff, ['-y', '-v', 'error', '-i', input, '-vf', `scale=${scale},pad=${pad}`, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', dest], { encoding: 'utf8' });
  return dest;
}

function which(bin) {
  for (const dir of (process.env.PATH || '').split(':')) {
    const p = path.join(dir, bin);
    if (fs.existsSync(p)) return p;
  }
  return null;
}
