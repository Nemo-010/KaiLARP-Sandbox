import type { Recorder, RecordingHandle, RecordingReport } from './recorder';

/**
 * Web recorder.
 *
 * Uses the browser capture API when it is available (a real browser tab, with
 * the user's permission). Inside an automated harness there is no capture
 * device, so it reports that the harness is doing the recording instead of
 * pretending it captured something.
 */
export function createRecorder(): Recorder {
  const canCapture = () =>
    typeof navigator !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);

  return {
    description: 'browser capture via getDisplayMedia + MediaRecorder',
    available: canCapture,
    async start(): Promise<RecordingHandle> {
      const startedAt = new Date().toISOString();
      let recorder: MediaRecorder | null = null;
      let stream: MediaStream | null = null;
      const chunks: Blob[] = [];

      if (canCapture()) {
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
          recorder = new MediaRecorder(stream);
          recorder.ondataavailable = (event) => {
            if (event.data && event.data.size) chunks.push(event.data);
          };
          recorder.start(250);
        } catch {
          recorder = null;
        }
      }

      return {
        async stop(): Promise<RecordingReport> {
          const stoppedAt = new Date().toISOString();
          if (!recorder) {
            return { ok: false, note: 'no capture device; the verify harness is recording this page', startedAt, stoppedAt };
          }
          await new Promise<void>((resolve) => {
            recorder!.onstop = () => resolve();
            recorder!.stop();
          });
          stream?.getTracks().forEach((t) => t.stop());
          const blob = new Blob(chunks, { type: 'video/webm' });
          const uri = typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(blob) : undefined;
          return { ok: blob.size > 0, note: `captured ${(blob.size / 1024).toFixed(0)} KiB`, startedAt, stoppedAt, uri };
        },
      };
    },
  };
}
