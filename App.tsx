import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { theme } from './src/theme';
import { ProgressBar, StageBar } from './src/components/ProgressBar';
import { Checklist, type Step, type StepStatus } from './src/components/Checklist';
import { SummaryTable } from './src/components/SummaryTable';
import RuntimeView from './src/components/RuntimeView';
import { createRecorder, type RecordingReport } from './src/record/recorder';
import { RecordingBanner } from './src/components/RecordingBanner';
import { fetchApp, parseManifestText } from './src/core/source';
import { gate, bootConfigFor } from './src/core/gate';
import { buildRuntimeHtml } from './src/core/runtimeHtml';
import { CORE_REVISION } from './src/core/generated';
import type { AppManifest, CheckRow, GateReport, RuntimeMessage, Stage } from './src/core/types';

const DEFAULT_URL =
  'https://dumps.tadiphone.dev/dumps/jio/f491h/-/tree/MAD-user-6.0-MRA58K-Jio-F491H-F001-04-13-310823-release-keys/system/b2g/webapps/youtube.com';

const DEFAULT_SETTINGS: Record<string, unknown> = {
  'deviceinfo.model': 'F491H',
  'deviceinfo.kaios.version': '2.5.3.2',
  'language.current': 'en-IN',
  'time.timezone': 'Asia/Kolkata',
  'ril.data.enabled': true,
};

const INITIAL_STEPS: Step[] = [
  { key: 'source', label: 'read the URL', status: 'idle' },
  { key: 'descriptor', label: 'parse update.webapp', status: 'idle' },
  { key: 'gate', label: 'host capability check', status: 'idle' },
  { key: 'package', label: 'open application.zip', status: 'idle' },
  { key: 'boot', label: 'boot under KaiLARP-core', status: 'idle' },
];

export default function App() {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [stage, setStage] = useState<Stage>('idle');
  const [steps, setSteps] = useState<Step[]>(INITIAL_STEPS);
  const [manifest, setManifest] = useState<AppManifest | null>(null);
  const [report, setReport] = useState<GateReport | null>(null);
  const [runtimeHtml, setRuntimeHtml] = useState<string | null>(null);
  const [checks, setChecks] = useState<CheckRow[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState<RecordingReport | null>(null);

  const recorder = useMemo(() => createRecorder(), []);
  const handleRef = useRef<{ stop: () => Promise<RecordingReport> } | null>(null);
  const autoran = useRef(false);

  const setStep = useCallback((key: string, status: StepStatus, note?: string) => {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, status, note: note ?? s.note } : s)));
  }, []);

  const progress = useMemo(() => {
    const done = steps.filter((s) => s.status === 'ok').length;
    return steps.some((s) => s.status === 'fail') ? done / steps.length : (done + (stage === 'running' ? 0.4 : 0)) / steps.length;
  }, [steps, stage]);

  const reset = useCallback(() => {
    setSteps(INITIAL_STEPS);
    setManifest(null);
    setReport(null);
    setRuntimeHtml(null);
    setChecks([]);
    setLogs([]);
    setError(null);
    setRecording(null);
    setStage('idle');
  }, []);

  const prepare = useCallback(
    async (source: string) => {
      reset();
      setStage('preparing');
      setStep('source', 'active');
      try {
        const app = await fetchApp(source);
        setStep('source', 'ok', app.sourceLabel);

        setStep('descriptor', 'active');
        const parsed = parseManifestText(app.manifestText);
        setManifest(parsed);
        setStep('descriptor', 'ok', `${parsed.display} v${parsed.version ?? '?'} · ${parsed.permissionNames.length} permissions`);

        setStep('gate', 'active');
        const verdict = gate(parsed);
        setReport(verdict);
        if (!verdict.ok) {
          setStep('gate', 'fail', `denied: ${verdict.denied.map((d) => d.capability).join(', ')}`);
          setStage('rejected');
          setStep('package', 'idle');
          setStep('boot', 'idle');
          return;
        }
        setStep('gate', 'ok', `${verdict.summary.spoofed} spoofed · ${verdict.summary.native} native · 0 denied`);

        setStep('package', 'active');
        setStep('package', app.hasArchive ? 'ok' : 'fail', app.hasArchive ? `${Object.keys(app.files).length} files in application.zip` : 'application.zip was not reachable from this network');
        if (!app.hasArchive) {
          // A descriptor-only boot is still useful evidence; keep going.
          setLogs((l) => [...l, 'note: no application.zip, booting the descriptor alone']);
        }

        const html = buildRuntimeHtml({
          manifest: parsed,
          report: verdict,
          boot: bootConfigFor(parsed, verdict, DEFAULT_SETTINGS),
          files: app.files,
        });
        setRuntimeHtml(html);
        setStage('running');
        setStep('boot', 'active');
        setLogs((l) => [...l, `launching ${parsed.launchPath} for ${parsed.origin ?? parsed.name}`]);

        const handle = await recorder.start();
        handleRef.current = handle;
      } catch (err) {
        setError(String((err as Error)?.message ?? err));
        setStage('error');
        setSteps((prev) => prev.map((s) => (s.status === 'active' ? { ...s, status: 'fail' as StepStatus } : s)));
      }
    },
    [recorder, reset, setStep],
  );

  const onRuntimeMessage = useCallback(
    async (message: RuntimeMessage) => {
      switch (message.type) {
        case 'ready':
          setLogs((l) => [...l, 'compat layer installed']);
          break;
        case 'log':
          setLogs((l) => [...l.slice(-200), `[${message.level}] ${message.msg}`]);
          break;
        case 'error':
          setError(message.msg);
          setLogs((l) => [...l, `error: ${message.msg}`]);
          break;
        case 'finish': {
          const rows: CheckRow[] = Object.entries(message.result?.checks ?? {}).map(([name, value]) => ({
            name,
            ok: !!value.ok,
            detail: value.detail ?? '',
          }));
          setChecks(rows);
          setStep('boot', rows.every((r) => r.ok) ? 'ok' : 'fail', `${rows.filter((r) => r.ok).length}/${rows.length} probes passed`);
          const captured = handleRef.current ? await handleRef.current.stop() : null;
          handleRef.current = null;
          if (captured) setRecording(captured);
          setStage('done');
          break;
        }
        case 'dump':
          setLogs((l) => [...l.slice(-200), `dump: ${JSON.stringify((message.dump as { calls?: unknown }).calls ?? {})}`]);
          break;
        default:
          break;
      }
    },
    [setStep],
  );

  const onRuntimeMessageRef = useRef(onRuntimeMessage);
  onRuntimeMessageRef.current = onRuntimeMessage;
  const stableMessageHandler = useCallback((m: RuntimeMessage) => void onRuntimeMessageRef.current(m), []);

  const stages = steps.map((s) => ({ label: s.label, done: s.status === 'ok', active: s.status === 'active', failed: s.status === 'fail' }));
  // EXPO_PUBLIC_AUTORUN=demo lets the CI device harness drive the whole flow
  // without tapping the screen, so the screencast is reproducible.
  React.useEffect(() => {
    if (autoran.current) return;
    autoran.current = true;
    if (process.env.EXPO_PUBLIC_AUTORUN === 'demo') void prepare('demo');
  }, [prepare]);

  const capabilityRows = useMemo(
    () => (report?.requirements ?? []).map((r) => ({ capability: r.capability, result: r.mode, note: r.note })),
    [report],
  );

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title}>KaiLARP Sandbox</Text>
        <Text style={styles.subtitle}>a Neucom Sphere compatibility bench · core {CORE_REVISION}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.label}>application URL</Text>
        <TextInput
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          placeholder="a dumps.tadiphone.dev tree URL, a raw URL, or demo"
          placeholderTextColor={theme.dim}
        />
        <View style={styles.buttonRow}>
          <Pressable style={[styles.button, styles.primary]} onPress={() => prepare(url)} disabled={stage === 'preparing' || stage === 'running'}>
            <Text style={styles.buttonText}>prepare &amp; run</Text>
          </Pressable>
          <Pressable style={styles.button} onPress={() => prepare('demo')} disabled={stage === 'preparing' || stage === 'running'}>
            <Text style={styles.buttonText}>bundled demo</Text>
          </Pressable>
          <Pressable style={styles.button} onPress={reset}>
            <Text style={styles.buttonText}>reset</Text>
          </Pressable>
        </View>

        <ProgressBar value={progress} />
        <StageBar stages={stages} />

        <Checklist steps={steps} />

        {stage === 'running' && (
          <View style={styles.runArea}>
            <Text style={styles.label}>F491H · 240x320 · portrait</Text>
            {runtimeHtml ? <RuntimeView html={runtimeHtml} onMessage={stableMessageHandler} /> : <ActivityIndicator color={theme.accent} />}
            <RecordingBanner report={recording} />
          </View>
        )}

        {stage === 'rejected' && report && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>refused, on purpose</Text>
            <Text style={styles.panelBody}>
              This app needs capabilities the runtime will not fabricate. Nothing was booted.
            </Text>
            {report.denied.map((d) => (
              <Text key={d.capability} style={styles.denied}>
                {d.capability} — {d.note}
              </Text>
            ))}
          </View>
        )}

        {stage === 'done' && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>{manifest?.display ?? 'app'} ran</Text>
            <SummaryTable checks={checks} capabilities={capabilityRows} />
            <RecordingBanner report={recording} />
          </View>
        )}

        {!!error && (
          <View style={[styles.panel, { borderColor: theme.bad }]}>
            <Text style={[styles.panelTitle, { color: theme.bad }]}>host said no</Text>
            <Text style={styles.panelBody}>{error}</Text>
            <Text style={styles.panelBody}>
              On a phone the fetch happens through the app itself, so URLs that a browser cannot read here still work there.
            </Text>
          </View>
        )}

        {logs.length > 0 && (
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>runtime log</Text>
            {logs.slice(-12).map((line, index) => (
              <Text key={`${index}-${line.slice(0, 8)}`} style={styles.logLine} numberOfLines={2}>
                {line}
              </Text>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: { paddingTop: Platform.OS === 'web' ? 24 : 56, paddingHorizontal: 18, paddingBottom: 10 },
  title: { color: theme.accent, fontSize: 22, fontWeight: '700' },
  subtitle: { color: theme.dim, fontSize: 12, marginTop: 2 },
  body: { paddingHorizontal: 18, paddingBottom: 48 },
  label: { color: theme.dim, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 6 },
  input: {
    backgroundColor: theme.bgSoft,
    borderColor: theme.line,
    borderWidth: 1,
    borderRadius: 10,
    color: theme.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12,
  },
  buttonRow: { flexDirection: 'row', gap: 8, marginTop: 12, flexWrap: 'wrap' },
  button: { backgroundColor: theme.panel, borderColor: theme.line, borderWidth: 1, borderRadius: 9, paddingHorizontal: 14, paddingVertical: 9 },
  primary: { backgroundColor: '#1d3b57', borderColor: '#2f6a97' },
  buttonText: { color: theme.text, fontSize: 13 },
  runArea: { alignItems: 'flex-start', marginTop: 8 },
  panel: { backgroundColor: theme.panel, borderColor: theme.line, borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 16 },
  panelTitle: { color: theme.accent, fontSize: 14, fontWeight: '600', marginBottom: 6 },
  panelBody: { color: theme.dim, fontSize: 12, marginTop: 4 },
  denied: { color: theme.bad, fontSize: 12, marginTop: 6 },
  logLine: { color: theme.dim, fontSize: 11, fontFamily: theme.mono, marginTop: 2 },
});
