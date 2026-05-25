import { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, spacing } from './theme';

type ScreenProps = {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  stickyFooter?: ReactNode;
};

export function Screen({ children, contentContainerStyle, stickyFooter }: ScreenProps) {
  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', default: undefined })}
      style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          stickyFooter ? styles.contentWithFooter : null,
          contentContainerStyle,
        ]}
        keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {stickyFooter ? <View style={styles.footer}>{stickyFooter}</View> : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: colors.background,
    flexGrow: 1,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
  },
  contentWithFooter: {
    paddingBottom: 136,
  },
  footer: {
    backgroundColor: colors.card,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
  },
  root: {
    backgroundColor: colors.background,
    flex: 1,
  },
});
