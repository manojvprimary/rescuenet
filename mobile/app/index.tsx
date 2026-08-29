import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { IconBadge } from '../components/IconBadge';
import { colors, type, fonts, space, radius } from '../lib/theme';

const REPORT_TYPES = [
  {
    type: 'STRAY',
    title: 'Stray or injured animal',
    subtitle: 'An animal that needs help now — routes to the nearest available shelter.',
    icon: 'paw' as const,
    bg: colors.primaryDim,
    fg: colors.primary,
  },
  {
    type: 'FOUND',
    title: 'Found animal',
    subtitle: "You've got hold of an animal and need somewhere for it to go.",
    icon: 'home' as const,
    bg: colors.successDim,
    fg: colors.success,
  },
  {
    type: 'LOST',
    title: 'Lost my pet',
    subtitle: 'Report a missing pet so nearby shelters can watch for it.',
    icon: 'heart' as const,
    bg: colors.accentDim,
    fg: colors.accent,
  },
];

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: space.xxl }}>
      <LinearGradient
        colors={[colors.headerStart, colors.headerEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.header, { paddingTop: insets.top + space.lg }]}
      >
        <View style={styles.brandRow}>
          <Text style={styles.brand}>RescueNet</Text>
          <Ionicons name="paw" size={20} color="rgba(255,255,255,0.75)" />
        </View>
        <Text style={styles.tagline}>What are you reporting?</Text>
      </LinearGradient>

      <View style={styles.body}>
        <Text style={styles.subtitle}>
          Pick the option that fits — every report reaches a real shelter within minutes.
        </Text>

        <View style={styles.cards}>
          {REPORT_TYPES.map(rt => (
            <Pressable
              key={rt.type}
              onPress={() => router.push(`/report/${rt.type}`)}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <IconBadge name={rt.icon} bg={rt.bg} fg={rt.fg} />
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{rt.title}</Text>
                <Text style={styles.cardSubtitle}>{rt.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.inkFaint} />
            </Pressable>
          ))}
        </View>

        <View style={styles.footerRow}>
          <Pressable onPress={() => router.push('/shelters')} style={styles.footerPill}>
            <Ionicons name="location-outline" size={15} color={colors.primary} />
            <Text style={styles.footerLinkText}>Nearby shelters</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/history')} style={styles.footerPill}>
            <Ionicons name="time-outline" size={15} color={colors.primary} />
            <Text style={styles.footerLinkText}>Live cases</Text>
          </Pressable>
        </View>

        <Text style={styles.anonNote}>
          No account needed. All submissions are anonymous — we only ever ask for a
          location and what you saw.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
  brand: { fontFamily: fonts.displayBold, fontSize: 26, color: '#FFFFFF' },
  tagline: { fontFamily: fonts.display, fontSize: 22, color: 'rgba(255,255,255,0.92)' },
  body: { paddingHorizontal: space.lg, paddingTop: space.xl },
  subtitle: { ...type.body, color: colors.inkDim, marginBottom: space.xl },
  cards: { gap: space.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
    gap: space.md,
    shadowColor: colors.primaryDeep,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  cardPressed: { backgroundColor: colors.surfaceMuted },
  cardTitle: { ...type.subtitle, color: colors.ink, marginBottom: 2 },
  cardSubtitle: { ...type.caption, color: colors.inkDim, fontWeight: '400' },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.xl,
    gap: space.sm,
  },
  footerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryDim,
  },
  footerLinkText: { ...type.caption, color: colors.primary, fontWeight: '700' },
  anonNote: {
    ...type.caption,
    color: colors.inkFaint,
    fontWeight: '400',
    textAlign: 'center',
    marginTop: space.xl,
    paddingHorizontal: space.lg,
  },
});
