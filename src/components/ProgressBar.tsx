import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../theme';

export function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${pct * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, backgroundColor: theme.line, overflow: 'hidden', width: '100%' },
  fill: { height: 6, backgroundColor: theme.accent },
});

export function StageBar({ stages }: { stages: { label: string; done: boolean; active: boolean; failed: boolean }[] }) {
  return (
    <View style={dotStyles.row}>
      {stages.map((s) => (
        <View key={s.label} style={dotStyles.item}>
          <View
            style={[
              dotStyles.dot,
              s.done && { backgroundColor: theme.ok },
              s.active && { backgroundColor: theme.accent },
              s.failed && { backgroundColor: theme.bad },
            ]}
          />
          <Text style={[dotStyles.label, s.active && { color: theme.accent }]} numberOfLines={1}>
            {s.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const dotStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  item: { alignItems: 'center', flex: 1 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.line },
  label: { color: theme.dim, fontSize: 10, marginTop: 4 },
});
