import { View, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius } from '../lib/theme';

interface Props {
  name:      keyof typeof Ionicons.glyphMap;
  bg:        string;
  fg:        string;
  size?:     number;
  iconSize?: number;
  round?:    boolean; // circular (confirmation/escalation) vs rounded-square (list cards)
  style?:    ViewStyle;
}

export function IconBadge({ name, bg, fg, size = 52, iconSize, round, style }: Props) {
  return (
    <View style={[
      styles.badge,
      { width: size, height: size, borderRadius: round ? size / 2 : radius.md, backgroundColor: bg },
      style,
    ]}>
      <Ionicons name={name} size={iconSize ?? Math.round(size * 0.5)} color={fg} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
});
