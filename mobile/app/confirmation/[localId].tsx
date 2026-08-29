import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../components/Button';
import { IconBadge } from '../../components/IconBadge';
import { getQueuedReport, subscribeToQueue, type QueuedReport } from '../../lib/offlineQueue';
import { colors, type, fonts, space, radius } from '../../lib/theme';

export default function Confirmation() {
  const { localId } = useLocalSearchParams<{ localId: string }>();
  const router = useRouter();
  const [record, setRecord] = useState<QueuedReport | undefined>();

  useEffect(() => {
    getQueuedReport(localId).then(setRecord);
    return subscribeToQueue(queue => {
      const match = queue.find(r => r.localId === localId);
      if (match) setRecord(match);
    });
  }, [localId]);

  if (!record) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const isSynced = record.status === 'synced' && !!record.caseId;

  return (
    <View style={styles.screen}>
      <IconBadge
        name={isSynced ? 'checkmark' : 'time-outline'}
        bg={colors.primaryDim}
        fg={colors.primary}
        size={72}
        iconSize={34}
        round
        style={{ alignSelf: 'center', marginBottom: space.lg }}
      />

      <Text style={styles.headline}>
        {isSynced ? 'Report received' : 'Report saved on your device'}
      </Text>
      <Text style={styles.subhead}>
        {isSynced
          ? "We're finding the best shelter match for this animal. You'll get updates below."
          : "Your report is saved right here on your device — it'll send automatically once you're back online."}
      </Text>

      {isSynced && (
        <View style={styles.caseBox}>
          <Text style={styles.caseId}>#{record.caseId!.slice(0, 8).toUpperCase()}</Text>
          <Text style={styles.caseIdLabel}>Your case ID — save this to track</Text>
        </View>
      )}

      <View style={styles.anonBadge}>
        <Ionicons name="lock-closed" size={13} color={colors.primary} />
        <Text style={styles.anonBadgeText}>Submitted anonymously</Text>
      </View>

      {!isSynced && (
        <View style={styles.pendingRow}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.pendingText}>
            {record.status === 'syncing' ? 'Sending now…' : 'Waiting for a connection'}
          </Text>
        </View>
      )}

      <View style={styles.actions}>
        {isSynced && (
          <Button label="Track this case" onPress={() => router.replace(`/case/${record.caseId}`)} />
        )}
        <Button
          label="Back to home"
          variant={isSynced ? 'secondary' : 'primary'}
          onPress={() => router.replace('/')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, padding: space.lg, paddingTop: space.xxl },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  headline: { fontFamily: fonts.display, fontSize: 25, color: colors.ink, textAlign: 'center', marginBottom: space.sm },
  subhead: { ...type.body, color: colors.inkDim, textAlign: 'center', marginBottom: space.xl, paddingHorizontal: space.md },
  caseBox: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    paddingVertical: space.xl,
    alignItems: 'center',
    marginBottom: space.lg,
  },
  caseId: { fontFamily: fonts.displayBold, fontSize: 30, color: colors.primaryDeep, marginBottom: space.xs },
  caseIdLabel: { ...type.caption, color: colors.inkDim, fontWeight: '400' },
  anonBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs,
    alignSelf: 'center', backgroundColor: colors.primaryDim,
    borderRadius: radius.pill, paddingVertical: space.xs, paddingHorizontal: space.md,
    marginBottom: space.xl,
  },
  anonBadgeText: { ...type.caption, color: colors.primary, fontWeight: '700' },
  pendingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, marginBottom: space.xl },
  pendingText: { ...type.subtitle, color: colors.primary },
  actions: { gap: space.md, marginTop: space.md },
});
