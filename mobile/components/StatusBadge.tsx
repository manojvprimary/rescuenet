import { View, Text, StyleSheet } from 'react-native';
import { colors, type, radius, space } from '../lib/theme';

// Every forward-progress state stays in the teal brand family, deepening as the
// case advances — only the terminal failure states break the pattern (amber for
// escalated, red for a post-assignment decline), matching how the mockups use color.
const STATUS_META: Record<string, { label: string; bg: string; fg: string }> = {
  SUBMITTED:              { label: 'Report received',   bg: colors.primaryDim, fg: colors.primary },
  PUBLISHED:              { label: 'Case enriched',      bg: colors.primaryDim, fg: colors.primary },
  AWAITING_CONFIRMATION:  { label: 'Shelter matched',    bg: colors.primaryDim, fg: colors.primaryDeep },
  ASSIGNED:               { label: 'Rescue in progress', bg: colors.successDim, fg: colors.success },
  MERGED:                 { label: 'Merged with another report', bg: colors.surfaceMuted, fg: colors.inkDim },
  ESCALATED:              { label: 'Escalated',          bg: colors.accentDim,  fg: colors.accent },
  NEEDS_REROUTING:        { label: 'Re-routing',         bg: colors.dangerDim,  fg: colors.danger },
};

export function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status, bg: colors.surfaceMuted, fg: colors.inkDim };
}

export function StatusBadge({ status }: { status: string }) {
  const meta = statusMeta(status);
  return (
    <View style={[styles.badge, { backgroundColor: meta.bg }]}>
      <View style={[styles.dot, { backgroundColor: meta.fg }]} />
      <Text style={[styles.text, { color: meta.fg }]}>{meta.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection:  'row',
    alignItems:     'center',
    alignSelf:      'flex-start',
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    borderRadius:   radius.pill,
    gap: space.xs,
  },
  dot:  { width: 6, height: 6, borderRadius: 3 },
  text: { ...type.caption },
});
