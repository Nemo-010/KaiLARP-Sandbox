import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';
import type { CheckRow } from '../core/types';

/**
 * The end-of-run summary: a table with the result and a note, nothing else.
 * Every row is either a probe the app ran or a capability the runtime reported.
 */
export function SummaryTable({ checks, capabilities }: { checks: CheckRow[]; capabilities: { capability: string; result: string; note: string }[] }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>probe</Text>
      {checks.map((c) => (
        <View key={c.name} style={styles.row}>
          <Text style={[styles.name, { color: c.ok ? theme.ok : theme.bad }]}>{c.ok ? 'ok' : 'FAIL'}</Text>
          <Text style={styles.cell}>{c.name}</Text>
          <Text style={styles.note}>{c.detail}</Text>
        </View>
      ))}
      <Text style={[styles.heading, { marginTop: 12 }]}>capability</Text>
      {capabilities.map((c) => (
        <View key={c.capability} style={styles.row}>
          <Text style={[styles.name, { color: c.result === 'deny' ? theme.bad : c.result === 'spoof' ? theme.warn : theme.ok }]}>
            {c.result}
          </Text>
          <Text style={styles.cell}>{c.capability}</Text>
          <Text style={styles.note}>{c.note}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4 },
  heading: { color: theme.dim, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: theme.line },
  name: { width: 56, fontSize: 11, fontFamily: theme.mono },
  cell: { flex: 1, color: theme.text, fontSize: 12 },
  note: { flex: 1.4, color: theme.dim, fontSize: 11 },
});
