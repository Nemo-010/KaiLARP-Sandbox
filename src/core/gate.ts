import type { AppManifest, GateReport, Requirement, CapabilityMode } from './types';
import { CAPABILITIES, PERMISSION_CAPABILITY_MAP, BOOT_DEVICE } from './generated';

/**
 * Client-side mirror of KaiLARP-core's gate.
 *
 * The app fetches the descriptor, maps its permissions to capabilities and
 * decides *before* booting whether the host can honestly provide them. This is
 * the same table core uses; scripts/sync-core.mjs generates both from one
 * source so they cannot drift.
 */
export function mapPermissions(permissionNames: string[], table?: Record<string, readonly string[]>): string[] {
  const map = table ?? (PERMISSION_CAPABILITY_MAP as unknown as Record<string, readonly string[]>);
  const wanted = new Set<string>();
  for (const name of permissionNames) {
    const mapped = map[name];
    if (mapped) mapped.forEach((c) => wanted.add(c));
    else wanted.add(`unknown:${name}`);
  }
  return [...wanted];
}

export function gate(manifest: AppManifest): GateReport {
  const capabilities = CAPABILITIES as unknown as Record<string, { mode: CapabilityMode; note: string }>;
  const permissionMap = PERMISSION_CAPABILITY_MAP as unknown as Record<string, readonly string[]>;
  const required = mapPermissions(manifest.permissionNames, permissionMap);
  const requirements: Requirement[] = required.map((capability) => {
    const entry = capabilities[capability];
    if (entry) return { capability, ...entry };
    return { capability, mode: 'unmodelled', note: 'no specific model; reported but does not block a boot' };
  });
  const pick = (mode: CapabilityMode) => requirements.filter((r) => r.mode === mode);
  const denied = pick('deny');
  return {
    ok: denied.length === 0,
    requirements,
    denied,
    spoofed: pick('spoof'),
    native: pick('native'),
    unmodelled: pick('unmodelled'),
    summary: {
      total: requirements.length,
      native: pick('native').length,
      spoofed: pick('spoof').length,
      denied: denied.length,
      unmodelled: pick('unmodelled').length,
    },
    app: { name: manifest.name, display: manifest.display, origin: manifest.origin },
    permissions: manifest.permissionNames,
  };
}

export function bootConfigFor(manifest: AppManifest, report: GateReport, settings: Record<string, unknown>) {
  return {
    device: BOOT_DEVICE,
    manifest: manifest.raw,
    capabilities: report,
    settings,
  };
}

export const F491H = BOOT_DEVICE;
