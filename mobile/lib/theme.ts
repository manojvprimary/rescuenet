// RescueNet design tokens — petrol-to-sea-green brand family (from the original
// product mockups), a serif display face paired with the system sans for body text,
// and a pill-forward shape language. Calm and trustworthy, not clinical.
export const colors = {
  bg:           '#F7F8F7',
  surface:      '#FFFFFF',
  surfaceMuted: '#F1F4F2',
  ink:          '#16211D',
  inkDim:       '#5C6B65',
  inkFaint:     '#96A29B',
  border:       '#E4E7E4',
  borderStrong: '#CBD4CF',

  headerStart: '#153B42', // deep petrol — gradient start
  headerEnd:   '#2F7D6E', // sea green — gradient end

  primary:     '#2C7D6C', // sea green — buttons, links, active states
  primaryDeep: '#153B42', // deep petrol — strong text accents
  primaryDim:  '#E1F3EB', // pale mint — badges, tinted cards

  // Reserved for the escalated/no-match state only — every other forward-progress
  // state stays in the teal family, matching how the mockups use color.
  accent:    '#96700E',
  accentDim: '#FBF0D6',

  danger:    '#B5432B',
  dangerDim: '#FAEAE5',

  success:    '#2C7D6C',
  successDim: '#E1F3EB',
} as const;

export const fonts = {
  display:     'Lora_600SemiBold',
  displayBold: 'Lora_700Bold',
} as const;

export const type = {
  display: { fontFamily: fonts.displayBold, fontSize: 30, letterSpacing: -0.3 },
  title:   { fontFamily: fonts.display,     fontSize: 21, letterSpacing: -0.1 },
  subtitle:{ fontSize: 15, fontWeight: '600' as const },
  body:    { fontSize: 15, fontWeight: '400' as const, lineHeight: 21 },
  caption: { fontSize: 13, fontWeight: '500' as const },
  label:   { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.6 },
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 10, md: 14, lg: 20, pill: 999 };
