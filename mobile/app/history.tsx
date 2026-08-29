import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import MapView, { Marker, Callout } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { IconBadge } from '../components/IconBadge';
import { statusMeta } from '../components/StatusBadge';
import { listNearbyCases, type NearbyCase } from '../lib/graphql';
import { getHistory, type HistoryItem } from '../lib/reportHistory';
import { getQueue, type QueuedReport } from '../lib/offlineQueue';
import { colors, type, fonts, space, radius } from '../lib/theme';

const RADII = [1, 3, 5, 10];

type LocState =
  | { status: 'loading' }
  | { status: 'denied' }
  | { status: 'ready'; lat: number; lng: number; address?: string };

export default function LiveCases() {
  const router = useRouter();
  const [tab, setTab] = useState<'nearby' | 'mine'>('nearby');
  const [loc, setLoc] = useState<LocState>({ status: 'loading' });
  const [radiusKm, setRadiusKm] = useState(5);
  const [cases, setCases] = useState<NearbyCase[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { detectLocation(); }, []);

  async function detectLocation() {
    setLoc({ status: 'loading' });
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { setLoc({ status: 'denied' }); return; }
    const pos = await Location.getCurrentPositionAsync({});
    const { latitude: lat, longitude: lng } = pos.coords;
    let address: string | undefined;
    try {
      const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (place) address = [place.street, place.city].filter(Boolean).join(', ');
    } catch { /* best-effort */ }
    setLoc({ status: 'ready', lat, lng, address });
  }

  useEffect(() => {
    if (loc.status !== 'ready') return;
    setLoading(true);
    listNearbyCases(loc.lat, loc.lng, radiusKm)
      .then(setCases)
      .finally(() => setLoading(false));
  }, [loc, radiusKm]);

  // ~111 km per degree of latitude; frame just over the selected radius
  const delta = (radiusKm * 1.3) / 111;
  const mappable = (cases ?? []).filter(c => c.lat != null && c.lng != null);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: space.xxl }}>
      {loc.status === 'ready' ? (
        <View style={styles.mapWrap}>
          <MapView
            style={styles.map}
            mapType="mutedStandard"
            showsUserLocation
            showsPointsOfInterests={false}
            region={{
              latitude: loc.lat,
              longitude: loc.lng,
              latitudeDelta: delta,
              longitudeDelta: delta,
            }}
          >
            {mappable.map(c => {
              const meta = statusMeta(c.status);
              return (
                <Marker
                  key={c.caseId}
                  coordinate={{ latitude: c.lat!, longitude: c.lng! }}
                  tracksViewChanges={false}
                >
                  <View style={[styles.pin, { backgroundColor: meta.fg }]}>
                    <Ionicons name="paw" size={16} color="#FFFFFF" />
                  </View>
                  <Callout onPress={() => router.push(`/case/${c.caseId}`)}>
                    <View style={styles.callout}>
                      <Text style={styles.calloutTitle}>
                        {c.species ? capitalize(c.species) : 'Animal'} · {meta.label}
                      </Text>
                      <Text style={styles.calloutSub}>
                        {c.distanceKm != null ? `${c.distanceKm.toFixed(1)} km away · ` : ''}View case →
                      </Text>
                    </View>
                  </Callout>
                </Marker>
              );
            })}
          </MapView>
          <View style={styles.mapBadge}>
            <Ionicons name="paw" size={12} color="#FFFFFF" />
            <Text style={styles.mapBadgeText}>
              {mappable.length} active {mappable.length === 1 ? 'case' : 'cases'} nearby
            </Text>
          </View>
        </View>
      ) : (
        <View style={[styles.mapWrap, styles.mapPlaceholder]}>
          {loc.status === 'loading'
            ? <ActivityIndicator color={colors.primary} />
            : <Text style={styles.emptyText}>Location access needed to show the map.</Text>}
        </View>
      )}

      <View style={styles.locationRow}>
        <Ionicons name="location" size={15} color={colors.primary} />
        <Text style={styles.locationText} numberOfLines={1}>
          {loc.status === 'ready' ? (loc.address ?? `${loc.lat.toFixed(3)}, ${loc.lng.toFixed(3)}`) : 'Finding your location…'}
        </Text>
      </View>

      <View style={styles.tabBar}>
        <TabButton label="Nearby" active={tab === 'nearby'} onPress={() => setTab('nearby')} />
        <TabButton label="My cases" active={tab === 'mine'} onPress={() => setTab('mine')} />
      </View>

      {tab === 'nearby'
        ? <NearbyList cases={cases} loading={loading} radiusKm={radiusKm} onRadiusChange={setRadiusKm} />
        : <MineList />}
    </ScrollView>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tabButton, active && styles.tabButtonActive]}>
      <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

// ── Nearby ───────────────────────────────────────────────────────────────────
function NearbyList({ cases, loading, radiusKm, onRadiusChange }: {
  cases: NearbyCase[] | null;
  loading: boolean;
  radiusKm: number;
  onRadiusChange: (r: number) => void;
}) {
  const router = useRouter();

  return (
    <View>
      <View style={styles.radiusRow}>
        {RADII.map(r => (
          <Pressable key={r} onPress={() => onRadiusChange(r)} style={[styles.radiusChip, radiusKm === r && styles.radiusChipActive]}>
            <Text style={[styles.radiusChipText, radiusKm === r && styles.radiusChipTextActive]}>{r} km</Text>
          </Pressable>
        ))}
      </View>

      {loading || cases === null ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : cases.length === 0 ? (
        <View style={styles.empty}>
          <IconBadge name="map-outline" bg={colors.surfaceMuted} fg={colors.inkFaint} size={64} iconSize={28} round />
          <Text style={styles.emptyTitle}>Nothing nearby right now</Text>
          <Text style={styles.emptyText}>Try a wider radius, or check back later.</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {cases.map(item => {
            const meta = statusMeta(item.status);
            return (
              <Pressable
                key={item.caseId}
                onPress={() => router.push(`/case/${item.caseId}`)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <IconBadge name="paw" bg={meta.bg} fg={meta.fg} size={44} iconSize={20} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.species ? capitalize(item.species) : 'Animal'} · {meta.label}</Text>
                  <Text style={styles.rowSubtitle}>
                    {item.distanceKm != null ? `${item.distanceKm.toFixed(1)} km away` : ''}
                    {'  ·  '}{relativeTime(item.timestamp)}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ── My cases ─────────────────────────────────────────────────────────────────
type Row =
  | { kind: 'synced'; item: HistoryItem }
  | { kind: 'pending'; item: QueuedReport };

function MineList() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);

  useFocusEffect(useCallback(() => {
    (async () => {
      const [history, queue] = await Promise.all([getHistory(), getQueue()]);
      const pending: Row[] = queue.filter(q => q.status !== 'synced').map(item => ({ kind: 'pending', item }));
      const synced: Row[]  = history.map(item => ({ kind: 'synced', item }));
      setRows([...pending, ...synced]);
    })();
  }, []));

  if (rows === null) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;

  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <IconBadge name="document-text-outline" bg={colors.surfaceMuted} fg={colors.inkFaint} size={64} iconSize={28} round />
        <Text style={styles.emptyTitle}>No reports yet</Text>
        <Text style={styles.emptyText}>Anything you submit from this device shows up here.</Text>
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {rows.map((row, i) => {
        if (row.kind === 'pending') {
          return (
            <View key={row.item.localId ?? `pending-${i}`} style={[styles.row, styles.rowPending]}>
              <IconBadge name="cloud-upload-outline" bg={colors.surface} fg={colors.primary} size={44} iconSize={20} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Report queued</Text>
                <Text style={[styles.rowSubtitle, { color: colors.primaryDeep }]}>
                  {row.item.status === 'syncing' ? 'Sending…' : 'Waiting for connection'}
                </Text>
              </View>
            </View>
          );
        }
        return (
          <Pressable
            key={row.item.caseId}
            onPress={() => router.push(`/case/${row.item.caseId}`)}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <IconBadge name="paw" bg={colors.primaryDim} fg={colors.primary} size={44} iconSize={20} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>#{row.item.caseId.slice(0, 8).toUpperCase()}</Text>
              <Text style={styles.rowSubtitle}>
                {row.item.species ? capitalize(row.item.species) : row.item.reportType}
                {'  ·  '}{new Date(row.item.submittedAt).toLocaleDateString()}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
          </Pressable>
        );
      })}
    </View>
  );
}

function capitalize(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

function relativeTime(ts: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: colors.bg },
  center:  { padding: space.xxl, alignItems: 'center', justifyContent: 'center' },
  empty:   { alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md },
  emptyTitle: { fontFamily: fonts.display, fontSize: 19, color: colors.ink },
  emptyText: { ...type.body, color: colors.inkDim, textAlign: 'center', maxWidth: 280 },
  list: { paddingHorizontal: space.lg, gap: space.md },

  mapWrap: {
    height: 320,
    marginHorizontal: space.lg,
    marginTop: space.md,
    marginBottom: space.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceMuted,
  },
  map: { flex: 1 },
  mapPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  mapBadge: {
    position: 'absolute', top: space.md, left: space.md,
    flexDirection: 'row', alignItems: 'center', gap: space.xs,
    backgroundColor: 'rgba(21,59,66,0.85)',
    paddingVertical: 6, paddingHorizontal: space.md,
    borderRadius: radius.pill,
  },
  mapBadgeText: { ...type.caption, color: '#FFFFFF', fontWeight: '700' },
  pin: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: '#FFFFFF',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  callout: { minWidth: 160, padding: 2 },
  calloutTitle: { ...type.subtitle, color: colors.ink, marginBottom: 2 },
  calloutSub: { ...type.caption, color: colors.primary, fontWeight: '600' },

  locationRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, paddingHorizontal: space.lg, marginBottom: space.sm },
  locationText: { ...type.caption, color: colors.inkDim, fontWeight: '600', flexShrink: 1 },

  tabBar: {
    flexDirection: 'row', marginHorizontal: space.lg, marginBottom: space.lg, marginTop: space.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill, padding: 4, gap: 4,
  },
  tabButton: { flex: 1, paddingVertical: space.sm, borderRadius: radius.pill, alignItems: 'center' },
  tabButtonActive: { backgroundColor: colors.surface, shadowColor: colors.primaryDeep, shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  tabButtonText: { ...type.caption, color: colors.inkDim, fontWeight: '700' },
  tabButtonTextActive: { color: colors.primaryDeep },

  radiusRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, marginBottom: space.lg },
  radiusChip: { paddingVertical: space.xs, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  radiusChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  radiusChipText: { ...type.caption, color: colors.ink, fontWeight: '700' },
  radiusChipTextActive: { color: '#FFFFFF' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: space.md,
    shadowColor: colors.primaryDeep, shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 1,
  },
  rowPending: { backgroundColor: colors.primaryDim, borderColor: colors.primaryDim, shadowOpacity: 0 },
  rowPressed: { backgroundColor: colors.surfaceMuted },
  rowTitle: { ...type.subtitle, color: colors.ink, marginBottom: 2 },
  rowSubtitle: { ...type.caption, color: colors.inkDim, fontWeight: '400' },
});
