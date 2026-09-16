export type CapabilityMode = 'native' | 'spoof' | 'deny' | 'unmodelled';

export interface CapabilityEntry {
  mode: CapabilityMode;
  note: string;
}

export interface Requirement extends CapabilityEntry {
  capability: string;
}

export interface GateReport {
  ok: boolean;
  requirements: Requirement[];
  denied: Requirement[];
  spoofed: Requirement[];
  native: Requirement[];
  unmodelled: Requirement[];
  summary: { total: number; native: number; spoofed: number; denied: number; unmodelled: number };
  app: { name: string; display: string; origin: string | null };
  permissions: string[];
}

export interface AppManifest {
  name: string;
  display: string;
  version: string | null;
  origin: string | null;
  launchPath: string;
  permissions: Record<string, unknown>;
  permissionNames: string[];
  raw: Record<string, unknown>;
}

export interface FetchedApp {
  manifestText: string;
  /** path inside the package -> bytes */
  files: Record<string, Uint8Array>;
  hasArchive: boolean;
  sourceLabel: string;
}

export interface CheckRow {
  name: string;
  ok: boolean;
  detail: string;
}

/** Messages the runtime document posts back to the host view. */
export type RuntimeMessage =
  | { type: 'ready' }
  | { type: 'log'; level: string; msg: string }
  | { type: 'finish'; result: { checks?: Record<string, { ok: boolean; detail: string | null }>; kind?: string } }
  | { type: 'dump'; dump: Record<string, unknown> }
  | { type: 'error'; msg: string };

export type Stage = 'idle' | 'preparing' | 'gating' | 'running' | 'done' | 'rejected' | 'error';
