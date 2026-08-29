import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import { listShelters, type ShelterRecord } from '../lib/graphql';
import { haversineKm } from '../lib/geo';
import { colors, type, space, radius } from '../lib/theme';

interface Row extends ShelterRecord { distanceKm?: number }

export default function Shelters() {
  const [rows, setRows]       = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [shelters, position] = await Promise.all([
        listShelters(),
        getDeviceLocation(),
      ]);

      const withDistance = shelters
        .map(s => ({
          ...s,
          distanceKm: position
            ? haversineKm(position.lat, position.lng, s.location?.lat, s.location?.lng)
            : undefined,
        }))
        .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));

      setRows(withDistance);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  }

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={rows}
      keyExtractor={s => s.shelterId}
      renderItem={({ item }) => <ShelterCard shelter={item} />}
      ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
    />
  );
}

function ShelterCard({ shelter }: { shelter: Row }) {
  const isTier1 = shelter.tier === 1;
  const slots   = shelter.capacity?.availableSlots;
  const hasSlots = isTier1 && (slots ?? 0) > 0;

  const pillBg = isTier1 ? (hasSlots ? colors.successDim : colors.surfaceMuted) : colors.primaryDim;
  const pillFg = isTier1 ? (hasSlots ? colors.success : colors.inkFaint) : colors.primary;

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.name}>{shelter.name}</Text>
        <View style={[styles.pill, { backgroundColor: pillBg }]}>
          <View style={[styles.pillDot, { backgroundColor: pillFg }]} />
          <Text style={[styles.pillText, { color: pillFg }]}>
            {isTier1 ? (hasSlots ? 'Available' : 'At capacity') : 'Via coordinator'}
          </Text>
        </View>
      </View>

      <View style={styles.metaRow}>
        {shelter.distanceKm !== undefined && Number.isFinite(shelter.distanceKm) && (
          <Text style={styles.metaText}>{shelter.distanceKm.toFixed(1)} km away</Text>
        )}
        {isTier1 && (
          <>
            <Dot />
            <Text style={styles.metaText}>{slots ?? 0} slot{slots === 1 ? '' : 's'}</Text>
            <Dot />
            <Text style={styles.metaText}>{shelter.capacity?.hasVetOnSite ? 'Vet on site' : 'No vet on site'}</Text>
          </>
        )}
      </View>
    </View>
  );
}

function Dot() { return <View style={styles.metaDot} />; }

async function getDeviceLocation(): Promise<{ lat: number; lng: number } | undefined> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return undefined;
  const pos = await Location.getCurrentPositionAsync({});
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}

const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg },
  center:  { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    padding: space.lg,
    shadowColor: colors.primaryDeep, shadowOpacity: 0.05, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 1,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: space.sm, gap: space.sm },
  name: { ...type.subtitle, color: colors.ink, flex: 1 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: space.xs,
    paddingVertical: 4, paddingHorizontal: space.sm, borderRadius: radius.pill,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { ...type.caption, fontSize: 11 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  metaText: { ...type.caption, color: colors.inkDim, fontWeight: '400' },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: colors.inkFaint, marginHorizontal: space.xs },
});
