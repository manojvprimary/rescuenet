import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { colors, type, radius, space } from '../lib/theme';

interface Props {
  label:      string;
  onPress:    () => void;
  variant?:   'primary' | 'secondary' | 'ghost';
  disabled?:  boolean;
  loading?:   boolean;
  style?:     ViewStyle;
}

export function Button({ label, onPress, variant = 'primary', disabled, loading, style }: Props) {
  const isPrimary   = variant === 'primary';
  const isSecondary = variant === 'secondary';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        isPrimary && styles.primary,
        isSecondary && styles.secondary,
        variant === 'ghost' && styles.ghost,
        (disabled || loading) && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      {loading
        ? <ActivityIndicator color={isPrimary ? '#fff' : colors.primary} />
        : (
          <Text style={[
            styles.label,
            isPrimary && styles.labelPrimary,
            isSecondary && styles.labelSecondary,
            variant === 'ghost' && styles.labelGhost,
          ]}>
            {label}
          </Text>
        )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 54,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    flexDirection: 'row',
  },
  primary:   { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.primary },
  ghost:     { backgroundColor: 'transparent' },
  disabled:  { opacity: 0.5 },
  pressed:   { opacity: 0.85, transform: [{ scale: 0.99 }] },
  label:          { ...type.subtitle },
  labelPrimary:   { color: '#FFFFFF' },
  labelSecondary: { color: colors.primary },
  labelGhost:     { color: colors.inkDim },
});
