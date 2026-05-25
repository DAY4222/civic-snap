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
  scroll?: boolean;
  stickyFooter?: ReactNode;
};

export function Screen({
  children,
  contentContainerStyle,
  scroll = true,
  stickyFooter,
}: ScreenProps) {
  const contentStyle = [
    styles.content,
    !scroll ? styles.staticContent : null,
    stickyFooter ? styles.contentWithFooter : null,
    contentContainerStyle,
  ];

  return (
    <KeyboardAvoidingView
      behavior={Platform.select({ ios: 'padding', default: undefined })}
      style={styles.root}>
      {scroll ? (
        <ScrollView contentContainerStyle={contentStyle} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={contentStyle}>{children}</View>
      )}
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
  staticContent: {
    flex: 1,
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
