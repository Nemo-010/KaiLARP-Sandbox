import type { AppManifest, GateReport } from './types';
import { SHIM_SOURCE } from './generated';
import { buildAppDocument } from './inline';

const BRIDGE_SOURCE = `(function () {
  var send = function (m) {
    try {
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(m));
      } else if (window.parent && window.parent !== window) {
        window.parent.postMessage(m, '*');
      }
    } catch (e) { /* the host went away */ }
  };
  window.__KAILARP_SEND__ = send;
  ['log', 'warn', 'error'].forEach(function (lvl) {
    var orig = console[lvl];
    console[lvl] = function () {
      try { send({ type: 'log', level: lvl, msg: Array.prototype.map.call(arguments, String).join(' ') }); } catch (e) {}
      return orig.apply(console, arguments);
    };
  });
  window.addEventListener('error', function (e) { send({ type: 'error', msg: String(e.message || e) }); });
  function arm() {
    if (!window.__KAILARP__ || !window.__KAILARP__.finish) return false;
    var orig = window.__KAILARP__.finish;
    window.__KAILARP__.finish = function (r) {
      var out = orig.apply(this, arguments);
      try { send({ type: 'finish', result: r || {} }); send({ type: 'dump', dump: window.__KAILARP__.dump() }); } catch (e) {}
      return out;
    };
    send({ type: 'ready' });
    return true;
  }
  if (!arm()) { var t = setInterval(function () { if (arm()) clearInterval(t); }, 10); }
  setTimeout(function () {
    try { if (!window.__KAILARP__.dump().completed) send({ type: 'dump', dump: window.__KAILARP__.dump() }); } catch (e) {}
  }, 6000);
})();`;

function escapeForScript(json: string): string {
  return json.replace(/</g, '\\u003c').replace(/-->/g, '--\\u003e');
}

function injectAfterHead(html: string, injection: string): string {
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}\n${injection}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}\n<head>${injection}</head>`);
  return `${injection}\n${html}`;
}

export interface RuntimeOptions {
  manifest: AppManifest;
  report: GateReport;
  boot: Record<string, unknown>;
  files: Record<string, Uint8Array>;
}

/** The self-contained document that is booted in an iframe or a WebView. */
export function buildRuntimeHtml({ manifest, boot, files }: RuntimeOptions): string {
  const appHtml = buildAppDocument(manifest.launchPath.replace(/^\/+/, ''), files);
  const injection = [
    `<script>window.__KAILARP_BOOT__ = ${escapeForScript(JSON.stringify(boot))};</script>`,
    `<script>${SHIM_SOURCE.replace(/<\/script>/gi, '<\\/script>')}</script>`,
    `<script>${BRIDGE_SOURCE}</script>`,
  ].join('\n');
  return injectAfterHead(appHtml, injection);
}
