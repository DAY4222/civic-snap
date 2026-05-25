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
  autoCapitalize?: TextInputProps['autoCapitalize'];
  inputStyle?: StyleProp<TextStyle>;
  keyboardType?: KeyboardTypeOptions;
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder?: string;
  textContentType?: TextInputProps['textContentType'];
  value: string;
};

export function Field({
  autoCapitalize,
  inputStyle,
  keyboardType,
  label,
  multiline,
  onChangeText,
  placeholder,
  textContentType,
  value,
}: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
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
