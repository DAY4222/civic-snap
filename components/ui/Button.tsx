import { type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { colors, radius } from './theme';

type ButtonVariant = 'primary' | 'secondary' | 'dark' | 'plain';

type ButtonProps = {
  disabled?: boolean;
  icon?: ReactNode;
  loading?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  title: string;
  variant?: ButtonVariant;
};

export function Button({
  disabled,
  icon,
  loading,
  onPress,
  style,
  textStyle,
  title,
  variant = 'primary',
}: ButtonProps) {
  const isDisabled = disabled || loading;
  const primaryLike = variant === 'primary' || variant === 'dark';

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}>
      {loading ? <ActivityIndicator color={primaryLike ? '#fff' : colors.primary} /> : icon}
      <Text style={[styles.text, primaryLike ? styles.lightText : styles.darkText, textStyle]}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: radius.lg,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 54,
    paddingHorizontal: 16,
  },
  dark: {
    backgroundColor: colors.text,
  },
  darkText: {
    color: colors.text,
  },
  disabled: {
    opacity: 0.55,
  },
  lightText: {
    color: '#fff',
  },
  plain: {
    backgroundColor: 'transparent',
    minHeight: 48,
  },
  pressed: {
    opacity: 0.82,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  secondary: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
});
