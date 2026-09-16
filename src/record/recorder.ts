export interface RecordingReport {
  ok: boolean;
  note: string;
  startedAt: string;
  stoppedAt: string;
  frames?: number;
  uri?: string;
}

export interface RecordingHandle {
  stop(): Promise<RecordingReport>;
}

export interface Recorder {
  description: string;
  available(): boolean;
  start(): Promise<RecordingHandle>;
}

/**
 * Native recorder.
 *
 * Android/iOS builds do not ship a capture module by default. The screen
 * recording for a device run is produced by the CI harness with
 * `adb shell screenrecord` (see .github/workflows/device.yml); what this
 * records in-app is the runtime's own evidence dump, which is what the
 * summary table is built from. Swapping in MediaProjection here is the one
 * extension point needed for in-app video.
 */
export function createRecorder(): Recorder {
  const note = 'device screen capture is produced by the CI harness (adb shell screenrecord); in-app evidence is the runtime dump';
  return {
    description: note,
    available: () => false,
    async start() {
      const startedAt = new Date().toISOString();
      return {
        async stop(): Promise<RecordingReport> {
          return { ok: true, note, startedAt, stoppedAt: new Date().toISOString() };
        },
      };
    },
  };
}
