import { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radius } from './theme';

type CardProps = {
  children: ReactNode;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  tone?: 'plain' | 'warning';
};

export function Card({ children, selected, style, tone = 'plain' }: CardProps) {
  return (
    <View
      style={[
        styles.card,
        selected && styles.selected,
        tone === 'warning' && styles.warning,
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  selected: {
    borderColor: colors.primary,
  },
  warning: {
    backgroundColor: colors.warningBackground,
    borderWidth: 0,
  },
});
