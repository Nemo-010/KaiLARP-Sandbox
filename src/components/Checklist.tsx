import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';

export type StepStatus = 'idle' | 'active' | 'ok' | 'fail';

export interface Step {
  key: string;
  label: string;
  status: StepStatus;
  note?: string;
}

const symbol: Record<StepStatus, string> = { idle: '·', active: '›', ok: '✓', fail: '✕' };
const color: Record<StepStatus, string> = { idle: theme.dim, active: theme.accent, ok: theme.ok, fail: theme.bad };

export function Checklist({ steps }: { steps: Step[] }) {
  return (
    <View style={styles.wrap}>
      {steps.map((s) => (
        <View key={s.key} style={styles.row}>
          <Text style={[styles.mark, { color: color[s.status] }]}>{symbol[s.status]}</Text>
          <View style={styles.body}>
            <Text style={[styles.label, { color: s.status === 'idle' ? theme.dim : theme.text }]}>{s.label}</Text>
            {!!s.note && <Text style={styles.note}>{s.note}</Text>}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10 },
  row: { flexDirection: 'row', paddingVertical: 4, alignItems: 'flex-start' },
  mark: { width: 18, fontSize: 13, lineHeight: 18 },
  body: { flex: 1 },
  label: { fontSize: 13 },
  note: { color: theme.dim, fontSize: 11, marginTop: 1 },
});
