import {
  StyleSheet,
  Text,
  TextInput,
  type KeyboardTypeOptions,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  View,
} from 'react-native';

import { colors, radius, typography } from './theme';

type FieldProps = {
  accessibilityLabel?: string;
  autoComplete?: TextInputProps['autoComplete'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoCorrect?: TextInputProps['autoCorrect'];
  inputStyle?: StyleProp<TextStyle>;
  keyboardType?: KeyboardTypeOptions;
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder?: string;
  returnKeyType?: TextInputProps['returnKeyType'];
  textContentType?: TextInputProps['textContentType'];
  value: string;
};

export function Field({
  accessibilityLabel,
  autoComplete,
  autoCapitalize,
  autoCorrect,
  inputStyle,
  keyboardType,
  label,
  multiline,
  onChangeText,
  placeholder,
  returnKeyType,
  textContentType,
  value,
}: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={accessibilityLabel ?? label}
        autoComplete={autoComplete}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        returnKeyType={returnKeyType}
        style={[styles.input, multiline && styles.multiline, inputStyle]}
        textContentType={textContentType}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 7,
  },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    color: colors.text,
    fontSize: 16,
    padding: 14,
  },
  label: {
    color: colors.muted,
    ...typography.label,
  },
  multiline: {
    minHeight: 86,
    textAlignVertical: 'top',
  },
});
