import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, Pressable, Image, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../../components/Button';
import { enqueueReport } from '../../lib/offlineQueue';
import { colors, type, fonts, space, radius } from '../../lib/theme';

const SPECIES = ['Dog', 'Cat', 'Bird', 'Other'];
const MAX_PHOTOS = 5;

const TYPE_COPY: Record<string, { title: string; cta: string }> = {
  STRAY: { title: 'Report a stray or injured animal', cta: 'Submit report anonymously' },
  FOUND: { title: "Tell us about the animal you've found", cta: 'Submit report anonymously' },
  LOST:  { title: 'Describe your missing pet', cta: 'Submit anonymously' },
};

type LocationState =
  | { status: 'loading' }
  | { status: 'denied' }
  | { status: 'ready'; lat: number; lng: number; accuracy?: number; address?: string };

export default function ReportForm() {
  const { type: reportType } = useLocalSearchParams<{ type: string }>();
  const router = useRouter();
  const copy = TYPE_COPY[reportType as string] ?? TYPE_COPY.STRAY;

  const [species, setSpecies]   = useState<string>('Dog');
  const [condition, setCondition] = useState('');
  const [canWait, setCanWait]   = useState<boolean | null>(null);
  const [photoUris, setPhotoUris] = useState<string[]>([]);
  const [location, setLocation] = useState<LocationState>({ status: 'loading' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { detectLocation(); }, []);

  async function detectLocation() {
    setLocation({ status: 'loading' });
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { setLocation({ status: 'denied' }); return; }

    const pos = await Location.getCurrentPositionAsync({});
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;

    let address: string | undefined;
    try {
      const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (place) address = [place.street, place.city, place.region].filter(Boolean).join(', ');
    } catch {
      // reverse geocoding is best-effort — raw coordinates are still shown below
    }

    setLocation({ status: 'ready', lat, lng, accuracy: accuracy ?? undefined, address });
  }

  async function pickPhoto(fromCamera: boolean) {
    const remaining = MAX_PHOTOS - photoUris.length;
    if (remaining <= 0) return;

    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'], quality: 0.6,
          allowsMultipleSelection: true, selectionLimit: remaining,
        });

    if (!result.canceled && result.assets.length) {
      setPhotoUris(prev => [...prev, ...result.assets.map(a => a.uri)].slice(0, MAX_PHOTOS));
    }
  }

  function removePhoto(uri: string) {
    setPhotoUris(prev => prev.filter(u => u !== uri));
  }

  async function handleSubmit() {
    if (location.status !== 'ready') {
      Alert.alert('Location needed', 'RescueNet needs your location to route this report to a nearby shelter.');
      return;
    }

    setSubmitting(true);
    try {
      const queued = await enqueueReport({
        lat: location.lat,
        lng: location.lng,
        accuracyMetres: location.accuracy,
        reportType: reportType as string,
        reportData: {
          reportType,
          species:  species.toLowerCase(),
          condition: condition.trim() || 'No additional description provided.',
          reporterSituation: canWait === false ? 'cannot stay, must leave soon' : 'can wait with the animal',
          locationContext: location.address,
        },
      }, photoUris);

      router.replace(`/confirmation/${queued.localId}`);
    } catch (err) {
      Alert.alert('Something went wrong', String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>{copy.title}</Text>

      <Field label="Species">
        <View style={styles.chipRow}>
          {SPECIES.map(s => (
            <Pressable
              key={s}
              onPress={() => setSpecies(s)}
              style={[styles.chip, species === s && styles.chipActive]}
            >
              <Text style={[styles.chipText, species === s && styles.chipTextActive]}>{s}</Text>
            </Pressable>
          ))}
        </View>
      </Field>

      <Field label="What did you see?">
        <TextInput
          style={styles.textArea}
          multiline
          numberOfLines={4}
          placeholder="e.g. Limping badly, favoring its front left leg, seems distressed"
          placeholderTextColor={colors.inkFaint}
          value={condition}
          onChangeText={setCondition}
        />
      </Field>

      <Field label="Can you wait with the animal?">
        <View style={styles.chipRow}>
          <Pressable onPress={() => setCanWait(true)} style={[styles.chip, canWait === true && styles.chipActive]}>
            <Text style={[styles.chipText, canWait === true && styles.chipTextActive]}>Yes, I can wait</Text>
          </Pressable>
          <Pressable onPress={() => setCanWait(false)} style={[styles.chip, canWait === false && styles.chipActive]}>
            <Text style={[styles.chipText, canWait === false && styles.chipTextActive]}>No, I need to leave</Text>
          </Pressable>
        </View>
      </Field>

      <Field label={`Photos (optional, up to ${MAX_PHOTOS})`}>
        {photoUris.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: space.sm }}>
            <View style={styles.photoStrip}>
              {photoUris.map(uri => (
                <View key={uri} style={styles.photoPreviewWrap}>
                  <Image source={{ uri }} style={styles.photoPreview} />
                  <Pressable onPress={() => removePhoto(uri)} style={styles.photoRemoveBadge} hitSlop={8}>
                    <Ionicons name="close" size={14} color="#FFFFFF" />
                  </Pressable>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
        {photoUris.length < MAX_PHOTOS && (
          <View style={styles.chipRow}>
            <Pressable onPress={() => pickPhoto(true)} style={styles.chip}>
              <Ionicons name="camera-outline" size={15} color={colors.ink} />
              <Text style={styles.chipText}>Take photo</Text>
            </Pressable>
            <Pressable onPress={() => pickPhoto(false)} style={styles.chip}>
              <Ionicons name="image-outline" size={15} color={colors.ink} />
              <Text style={styles.chipText}>
                {photoUris.length ? 'Add more' : 'Choose from library'}
              </Text>
            </Pressable>
          </View>
        )}
      </Field>

      <Field label="Location">
        <LocationRow state={location} onRetry={detectLocation} />
      </Field>

      <Button
        label={copy.cta}
        onPress={handleSubmit}
        loading={submitting}
        disabled={location.status === 'loading'}
        style={{ marginTop: space.lg }}
      />
    </ScrollView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function LocationRow({ state, onRetry }: { state: LocationState; onRetry: () => void }) {
  if (state.status === 'loading') {
    return <Text style={styles.locationText}>Finding your location…</Text>;
  }
  if (state.status === 'denied') {
    return (
      <Pressable onPress={onRetry}>
        <Text style={[styles.locationText, { color: colors.danger }]}>
          Location permission denied — tap to try again
        </Text>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onRetry} style={styles.locationReady}>
      <Ionicons name="location" size={16} color={colors.primary} />
      <Text style={styles.locationText}>
        {state.address ?? `${state.lat.toFixed(4)}, ${state.lng.toFixed(4)}`}
      </Text>
      <Text style={styles.locationRefresh}>Refresh</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen:  { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: space.xxl },
  title:   { fontFamily: fonts.display, fontSize: 22, color: colors.ink, marginBottom: space.xl },
  field:   { marginBottom: space.lg },
  fieldLabel: { ...type.caption, color: colors.inkDim, marginBottom: space.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: space.xs,
    paddingVertical: space.sm + 2, paddingHorizontal: space.lg,
    borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipText:   { ...type.caption, color: colors.ink, fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF' },
  textArea: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.md, padding: space.md, minHeight: 100,
    textAlignVertical: 'top', ...type.body, color: colors.ink,
  },
  photoStrip: { flexDirection: 'row', gap: space.sm },
  photoPreviewWrap: { position: 'relative' },
  photoPreview: { width: 88, height: 88, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  photoRemoveBadge: {
    position: 'absolute', top: -6, right: -6,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: colors.bg,
  },
  locationReady: {
    flexDirection: 'row', alignItems: 'center', gap: space.sm,
    backgroundColor: colors.primaryDim, borderRadius: radius.md, padding: space.md,
  },
  locationText:   { ...type.body, color: colors.primaryDeep, flex: 1 },
  locationRefresh:{ ...type.caption, color: colors.primary, fontWeight: '700' },
});
