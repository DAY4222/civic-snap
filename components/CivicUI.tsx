import { ReactNode } from 'react';
import {
  Pressable,
  type PressableProps,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, hairline, radius, spacing, typography } from '@/constants/ui';

type ButtonVariant = 'primary' | 'secondary' | 'dark' | 'quiet';

export function Button({
  disabled,
  icon,
  label,
  onPress,
  style,
  textStyle,
  variant = 'primary',
}: {
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  onPress?: PressableProps['onPress'];
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  variant?: ButtonVariant;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        variant === 'primary' && styles.primaryButton,
        variant === 'secondary' && styles.secondaryButton,
        variant === 'dark' && styles.darkButton,
        variant === 'quiet' && styles.quietButton,
        disabled && styles.disabled,
        style,
      ]}>
      {icon}
      <Text
        style={[
          styles.buttonText,
          variant === 'primary' && styles.primaryButtonText,
          variant === 'secondary' && styles.secondaryButtonText,
          variant === 'dark' && styles.darkButtonText,
          variant === 'quiet' && styles.quietButtonText,
          textStyle,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Card({
  children,
  selected,
  style,
}: {
  children: ReactNode;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, selected && styles.selectedCard, style]}>{children}</View>;
}

export function Chip({
  children,
  selected,
  style,
  textStyle,
}: {
  children: ReactNode;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}) {
  return (
    <View style={[styles.chip, selected && styles.selectedChip, style]}>
      <Text style={[styles.chipText, selected && styles.selectedChipText, textStyle]}>{children}</Text>
    </View>
  );
}

export function Field({
  autoCapitalize,
  inputStyle,
  keyboardType,
  label,
  multiline,
  onChangeText,
  placeholder,
  style,
  textContentType,
  value,
}: {
  autoCapitalize?: TextInputProps['autoCapitalize'];
  inputStyle?: StyleProp<TextStyle>;
  keyboardType?: TextInputProps['keyboardType'];
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  textContentType?: TextInputProps['textContentType'];
  value: string;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inputPlaceholder}
        style={[styles.input, multiline && styles.multiline, inputStyle]}
        textContentType={textContentType}
        value={value}
      />
    </View>
  );
}

export function Notice({
  text,
  tone = 'plain',
}: {
  text: string;
  tone?: 'plain' | 'warning';
}) {
  return (
    <View style={[styles.notice, tone === 'warning' && styles.warningNotice]}>
      <Text style={[styles.noticeText, tone === 'warning' && styles.warningNoticeText]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: radius.control,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: hairline,
  },
  darkButton: {
    backgroundColor: colors.text,
  },
  quietButton: {
    backgroundColor: 'transparent',
    minHeight: 48,
  },
  disabled: {
    opacity: 0.6,
  },
  buttonText: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  primaryButtonText: {
    color: colors.surface,
  },
  secondaryButtonText: {
    color: colors.text,
  },
  darkButtonText: {
    color: colors.surface,
  },
  quietButtonText: {
    color: colors.text,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.card,
    borderWidth: hairline,
    padding: spacing.lg,
  },
  selectedCard: {
    borderColor: colors.primary,
  },
  chip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    overflow: 'hidden',
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  selectedChip: {
    backgroundColor: colors.primary,
  },
  chipText: {
    color: colors.primaryDark,
    fontSize: typography.caption,
    fontWeight: '800',
  },
  selectedChipText: {
    color: colors.surface,
  },
  field: {
    gap: 7,
  },
  label: {
    color: colors.muted,
    fontSize: typography.label,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.control,
    borderWidth: hairline,
    color: colors.text,
    fontSize: 16,
    padding: spacing.md,
  },
  multiline: {
    minHeight: 86,
    textAlignVertical: 'top',
  },
  notice: {
    backgroundColor: colors.primarySoft,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  warningNotice: {
    backgroundColor: colors.warningSoft,
  },
  noticeText: {
    color: colors.noticeText,
    fontSize: 14,
    lineHeight: 20,
  },
  warningNoticeText: {
    color: colors.warning,
  },
});
