import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';
import type { RecordingReport } from '../record/recorder';

/**
 * Shows what the screen-record pipeline is doing. Kept out of the
 * platform-specific recorder modules so both the native and the web build can
 * render it.
 */
export function RecordingBanner({ report }: { report: RecordingReport | null }) {
  if (!report) return null;
  return (
    <View style={styles.wrap}>
      <Text style={[styles.text, { color: report.ok ? theme.ok : theme.warn }]}>
        {report.ok ? 'recording' : 'recording unavailable'} · {report.note}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 6 },
  text: { fontSize: 11 },
});
