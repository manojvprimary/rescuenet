import { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Image, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  getCase, subscribeToCaseUpdates, listShelters, getCasePhotos,
  type CaseRecord, type ShelterRecord, type HistoryEntry,
} from '../../lib/graphql';
import { haversineKm } from '../../lib/geo';
import { IconBadge } from '../../components/IconBadge';
import { colors, type, fonts, space, radius } from '../../lib/theme';

const TERMINAL_STATUSES = new Set(['ASSIGNED', 'ESCALATED', 'MERGED']);

export default function CaseTracking() {
  const { caseId } = useLocalSearchParams<{ caseId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [caseRecord, setCaseRecord] = useState<CaseRecord | undefined>();
  const [shelters, setShelters]     = useState<ShelterRecord[]>([]);
  const [photos, setPhotos]         = useState<string[]>([]);
  const [linkedCase, setLinkedCase] = useState<CaseRecord | undefined>();
  const [linkedPhoto, setLinkedPhoto] = useState<string | undefined>();
  const [live, setLive]             = useState(false);
  const [loading, setLoading]       = useState(true);
  const subRef = useRef<{ unsubscribe: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [c, s, p] = await Promise.all([
        getCase(caseId),
        listShelters(),
        getCasePhotos(caseId).catch(() => [] as string[]),
      ]);
      if (cancelled) return;
      setCaseRecord(c);
      setShelters(s);
      setPhotos(p);
      setLoading(false);

      // A dedup soft-link means another active case is probably the same animal —
      // surface it so a lost-pet reporter can go identify their pet.
      if (c?.linkedTo) {
        const [lc, lp] = await Promise.all([
          getCase(c.linkedTo).catch(() => undefined),
          getCasePhotos(c.linkedTo).catch(() => [] as string[]),
        ]);
        if (cancelled) return;
        setLinkedCase(lc);
        setLinkedPhoto(lp[0]);
      }
    })();

    subRef.current = subscribeToCaseUpdates(
      caseId,
      updated => { setCaseRecord(updated); setLive(true); },
      () => setLive(false),
    );

    return () => { cancelled = true; subRef.current?.unsubscribe(); };
  }, [caseId]);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  }
  if (!caseRecord) {
    return (
      <View style={styles.center}>
        <Text style={styles.bodyText}>We couldn't find that case. It may have expired.</Text>
      </View>
    );
  }

  const winnerId = caseRecord.assignedTo ?? caseRecord.bidSummary?.winner;
  const shelter  = shelters.find(s => s.shelterId === winnerId);
  const distance = shelter
    ? haversineKm(caseRecord.location?.lat, caseRecord.location?.lng, shelter.location?.lat, shelter.location?.lng)
    : undefined;
  const bid = caseRecord.bidSummary?.allBids?.find(b => b.shelterId === winnerId);
  const species = (caseRecord.reportData?.species as string | undefined) ?? 'Animal';
  const history = (caseRecord.eventHistory ?? [])
    .map(entry => ({ entry, milestone: friendlyMilestone(entry) }))
    .filter((x): x is { entry: HistoryEntry; milestone: Milestone } => x.milestone !== null);
  const isTerminal = TERMINAL_STATUSES.has(caseRecord.status);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: space.xxl }}>
      <LinearGradient
        colors={[colors.headerStart, colors.headerEnd]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + space.md }]}
      >
        <View style={styles.headerTopRow}>
          <Text style={styles.headerCaseId}>Case #{caseId.slice(0, 8).toUpperCase()}</Text>
          <View style={styles.livePill}>
            <View style={[styles.liveDot, { backgroundColor: live ? '#7FE0B8' : 'rgba(255,255,255,0.5)' }]} />
            <Text style={styles.liveText}>{live ? 'Live' : 'Connecting…'}</Text>
          </View>
        </View>
        <Text style={styles.headerSubtitle}>
          {capitalize(species)} · {statusLabel(caseRecord.status)}
        </Text>
      </LinearGradient>

      <View style={styles.body}>
        {linkedCase && (() => {
          const linkedWinner  = linkedCase.assignedTo ?? linkedCase.bidSummary?.winner;
          const linkedShelter = shelters.find(sh => sh.shelterId === linkedWinner);
          return (
            <Pressable onPress={() => router.push(`/case/${linkedCase.caseId}`)} style={styles.matchCard}>
              <View style={styles.matchTopRow}>
                <IconBadge name="search" bg={colors.surface} fg={colors.primary} round size={40} iconSize={20} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.matchTitle}>Possible match reported nearby</Text>
                  <Text style={styles.matchBody}>
                    {linkedShelter
                      ? `A similar animal was reported close by — it's currently at ${linkedShelter.name}.`
                      : 'A similar animal was reported close by. Take a look — it might be the one.'}
                  </Text>
                </View>
                {linkedPhoto && <Image source={{ uri: linkedPhoto }} style={styles.matchThumb} />}
              </View>
              <View style={styles.matchCta}>
                <Text style={styles.matchCtaText}>View that case</Text>
                <Ionicons name="arrow-forward" size={14} color={colors.primaryDeep} />
              </View>
            </Pressable>
          );
        })()}

        {photos.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoStrip}>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {photos.map(uri => (
                <Image key={uri} source={{ uri }} style={styles.photo} />
              ))}
            </View>
          </ScrollView>
        )}

        {caseRecord.status === 'ESCALATED' && (
          <View style={styles.escalationCard}>
            <IconBadge name="warning" bg={colors.accentDim} fg={colors.accent} round size={44} iconSize={22} />
            <Text style={styles.escalationTitle}>No automatic match yet</Text>
            <Text style={styles.escalationBody}>
              Every shelter we checked either declined or was at capacity. This case has
              been flagged for manual follow-up rather than left unassigned.
            </Text>
          </View>
        )}

        {shelter && (
          <View style={styles.shelterCard}>
            <View style={styles.shelterTopRow}>
              <Ionicons name="home" size={16} color={colors.primaryDeep} />
              <Text style={styles.shelterLabel}>
                {caseRecord.status === 'ASSIGNED' ? `${shelter.name} assigned` : `${shelter.name} matched`}
              </Text>
            </View>
            <Text style={styles.shelterMetaLine}>
              {[
                distance !== undefined && Number.isFinite(distance) ? `${distance.toFixed(1)} km away` : null,
                bid?.hasVet ? 'Vet on site' : null,
              ].filter(Boolean).join(' · ')}
            </Text>
          </View>
        )}

        <Text style={styles.timelineHeading}>Progress</Text>
        <View>
          {history.map(({ entry, milestone }, i) => {
            const isLast    = i === history.length - 1;
            const isCurrent = isLast && !isTerminal;
            return (
              <View key={i} style={styles.timelineRow}>
                <View style={styles.timelineDotCol}>
                  <View style={[
                    styles.timelineDot,
                    isCurrent ? styles.timelineDotCurrent : styles.timelineDotDone,
                  ]} />
                  {!isLast && <View style={styles.timelineLine} />}
                </View>
                <View style={styles.timelineContent}>
                  <Text style={[styles.timelineAgent, isCurrent && { color: colors.primary }]}>
                    {milestone.title}
                  </Text>
                  <Text style={styles.timelineSummary}>{milestone.detail}</Text>
                  <Text style={styles.timelineTime}>{formatTime(entry.timestamp)}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

function capitalize(s: string) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    SUBMITTED: 'report received', PUBLISHED: 'finding the right shelter',
    AWAITING_CONFIRMATION: 'shelter matched', ASSIGNED: 'rescue in progress',
    ESCALATED: 'with a coordinator', MERGED: 'combined with another report',
  };
  return labels[status] ?? status.toLowerCase();
}

// Translate internal agent events into reporter-facing milestones. Returns null
// for pure plumbing (proximity pre-checks, geocoding fallbacks, analysis errors)
// so the timeline only shows outcomes a reporter would care about.
interface Milestone { title: string; detail: string }

function friendlyMilestone(entry: HistoryEntry): Milestone | null {
  const { agent, action, summary } = entry;

  switch (agent) {
    case 'intake':
      return { title: 'Report received', detail: 'We got your report and started working on it right away.' };

    case 'image-agent': {
      if (/failed/i.test(summary)) return null;
      const species = /species: (\w+)/i.exec(summary)?.[1];
      if (/no photo/i.test(summary)) {
        return { title: 'Details reviewed', detail: species ? `Noted as a ${species} from your description.` : 'We reviewed the details you provided.' };
      }
      return { title: 'Photo reviewed', detail: species ? `Looks like a ${species} — that helps us find the right shelter.` : 'We took a close look at your photo.' };
    }

    case 'geocoding-agent':
      if (/fallback/i.test(summary)) return null;
      return { title: 'Location confirmed', detail: 'We pinned down where the animal was seen.' };

    case 'dedup-agent':
      switch (action) {
        case 'proximity-checked': return null;
        case 'cleared':     return { title: 'Confirmed as a new case', detail: 'No one else has reported this animal — it’s being handled as its own case.' };
        case 'soft-linked': return { title: 'Similar report noticed', detail: 'Someone nearby may have reported the same animal. We’re keeping both in view.' };
        case 'merged':      return { title: 'Combined with another report', detail: 'Someone else already reported this animal, so we joined the two reports together.' };
        default: return null;
      }

    case 'needs-profile': {
      const urgency = /urgency: (\w+)/i.exec(summary)?.[1]?.toLowerCase();
      return {
        title: 'Care needs assessed',
        detail: urgency
          ? `We worked out what care is needed — urgency looks ${urgency === 'high' ? 'high, so this is being fast-tracked' : urgency}.`
          : 'We worked out what kind of care this animal needs.',
      };
    }

    case 'arbitrator':
      if (action === 'escalated') {
        return { title: 'Passed to a coordinator', detail: 'No shelter could take this automatically, so a human coordinator is now finding a placement.' };
      }
      return { title: 'Shelter selected', detail: 'We compared nearby shelters and asked the best match to take this case.' };

    case 'confirmation-handler':
      switch (action) {
        case 'confirmed':
        case 'assigned':  return { title: 'Rescue confirmed', detail: 'The shelter accepted the case — help is on the way.' };
        case 'declined-post-assignment':
          return { title: 'Finding another shelter', detail: 'The first shelter couldn’t take the case after all, so we’re re-matching it now.' };
        default:          return { title: 'Shelter contacted', detail: 'We’re waiting for the shelter to confirm they can take this case.' };
      }

    default:
      return { title: 'Case updated', detail: 'We’re continuing to work on this case.' };
  }
}

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch { return ts; }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  header: {
    paddingHorizontal: space.lg, paddingBottom: space.xl,
    borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg,
  },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.xs },
  headerCaseId: { fontFamily: fonts.displayBold, fontSize: 19, color: '#FFFFFF' },
  livePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: radius.pill,
    paddingVertical: 4, paddingHorizontal: space.sm,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveText: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
  headerSubtitle: { ...type.body, color: 'rgba(255,255,255,0.82)', fontWeight: '400' },
  body: { padding: space.lg },
  bodyText: { ...type.body, color: colors.inkDim, textAlign: 'center' },
  matchCard: {
    backgroundColor: colors.primaryDim, borderRadius: radius.lg, padding: space.lg,
    marginBottom: space.lg, borderWidth: 1.5, borderColor: colors.primary,
  },
  matchTopRow: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  matchTitle: { ...type.subtitle, color: colors.primaryDeep, marginBottom: space.xs },
  matchBody:  { ...type.body, color: colors.ink },
  matchThumb: { width: 64, height: 64, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  matchCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    gap: space.xs, marginTop: space.sm,
  },
  matchCtaText: { ...type.caption, color: colors.primaryDeep, fontWeight: '700' },
  photoStrip: { marginBottom: space.lg },
  photo: { width: 110, height: 110, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  escalationCard: {
    backgroundColor: colors.accentDim, borderRadius: radius.lg, padding: space.lg, marginBottom: space.lg,
  },
  escalationTitle: { ...type.subtitle, color: colors.accent, marginTop: space.sm, marginBottom: space.xs },
  escalationBody:  { ...type.body, color: colors.ink },
  shelterCard: {
    backgroundColor: colors.primaryDim, borderRadius: radius.lg, padding: space.lg, marginBottom: space.xl,
  },
  shelterTopRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginBottom: space.xs },
  shelterLabel: { ...type.subtitle, color: colors.primaryDeep },
  shelterMetaLine: { ...type.caption, color: colors.primary, fontWeight: '500' },
  timelineHeading: { ...type.subtitle, color: colors.ink, marginBottom: space.md },
  timelineRow: { flexDirection: 'row' },
  timelineDotCol: { alignItems: 'center', width: 20 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  timelineDotDone: { backgroundColor: colors.primary },
  timelineDotCurrent: { backgroundColor: colors.primaryDim, borderWidth: 2.5, borderColor: colors.primary },
  timelineLine: { width: 2, flex: 1, backgroundColor: colors.border, marginVertical: 2 },
  timelineContent: { flex: 1, paddingBottom: space.lg, paddingLeft: space.sm },
  timelineAgent:  { ...type.caption, color: colors.inkDim, fontWeight: '700', marginBottom: 2 },
  timelineSummary:{ ...type.body, color: colors.ink, marginBottom: 2 },
  timelineTime:   { ...type.caption, color: colors.inkFaint, fontWeight: '400' },
});
